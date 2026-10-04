import {beforeEach,afterEach,expect,test,vi} from 'vitest';

// Fault injection surrounds the checked grade/ledger boundary. The real Rules
// grading and reward transactions remain covered by integration.test.ts.
const state=vi.hoisted(()=>({docs:new Map<string,any>(),gradeCalls:[] as any[],failReview:false,failKeyRead:false,reviewWrites:0}));
const denied=()=>Object.assign(new Error('Injected permission denial'),{code:'permission-denied'});
vi.mock('firebase/firestore',()=>({
  doc:(_db:any,...parts:string[])=>({path:parts.join('/')}),
  getDocFromServer:async(ref:any)=>{
    if(state.failKeyRead&&ref.path.startsWith('assessmentKeys/')){state.failKeyRead=false;throw denied();}
    return{data:()=>state.docs.get(ref.path),exists:()=>state.docs.has(ref.path)};
  },
  setDoc:async(ref:any,data:any)=>{
    state.reviewWrites++;
    if(state.failReview){state.failReview=false;throw denied();}
    state.docs.set(ref.path,data);
  },
}));
vi.mock('../../client/src/lib/firebase',()=>({db:{app:{options:{projectId:'demo-recovery'}}},auth:{currentUser:{uid:'teacher'}}}));
vi.mock('../../client/src/lib/localAssessment',()=>({localMockIdentity:false,localIdentity:{}}));
vi.mock('../../client/src/lib/assessmentSession',()=>({assessmentActor:async()=>({teacher:true}),requireAssessmentActor:async()=>({teacher:true})}));
vi.mock('../../client/src/lib/rulesAssessment',()=>({
  saveShortGrade:async(_db:any,id:string,revision:number,marks:(number|null)[])=>{
    state.gradeCalls.push({id,revision,marks});
    const source=state.docs.get('submissions/'+id);
    if(source.grade.revision===revision+1&&JSON.stringify(source.grade.shortMarks)===JSON.stringify(marks))return source.grade;
    if(source.grade.revision!==revision)throw Error('Unexpected grading revision');
    source.grade={status:'graded',score:100,mcPoints:0,shortMarks:marks,revision:revision+1,rewardAmount:1,tierIndex:-1};
    return source.grade;
  },
  submitAndSettle:vi.fn(),finishAssessment:vi.fn(),verifyMC:vi.fn(),
}));
import {saveRulesGrade} from '../../client/src/lib/rulesAssessmentStore';

const key='hq.rules-grading.demo-recovery.teacher',id='recovery-attempt';
const marks=[{question_id:'q1',awarded:10,feedback:'教師評語'}],feedback='總評語';
let storage:Map<string,string>;
beforeEach(()=>{
  state.docs.clear();state.gradeCalls=[];state.failReview=false;state.failKeyRead=false;state.reviewWrites=0;
  storage=new Map();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)});
  const question={id:'q1',type:'short',prompt:'合成短答題',points:10};
  state.docs.set('submissions/'+id,{protocol:'rules-assessment/1',taskId:'task-short',studentId:'student',version:'v1',answers:[{question_id:'q1',value:'本機測試回答'}],createdAt:{toDate:()=>new Date('2026-10-04T00:00:00Z')},grade:{status:'pending',score:null,mcPoints:0,shortMarks:[null],revision:1,rewardAmount:0,tierIndex:-1}});
  state.docs.set('assessmentVersions/task-short--v1',{taskId:'task-short',version:'v1',title:'測試',questions:[question],questionCount:1,shortCount:1,totalPoints:10});
  state.docs.set('assessmentKeys/task-short--v1',{questions:[{id:'q1',answer:null,modelAnswer:'合成參考'}]});
  state.docs.set('profiles/student',{className:'1A',name:'測試學生',studentNo:'1'});
});
const pending=()=>JSON.parse(storage.get(key)??'[]');
afterEach(()=>vi.unstubAllGlobals());

test('review write denial keeps the original edit; retry completes without another grade revision',async()=>{
  state.failReview=true;
  await expect(saveRulesGrade(id,1,marks,feedback)).rejects.toMatchObject({code:'permission-denied',assessmentStage:'saveAssessmentReview'});
  expect(state.docs.get('submissions/'+id).grade.revision).toBe(2);
  expect(pending()).toHaveLength(1);expect(state.docs.has('assessmentReviews/'+id)).toBe(false);
  const result=await saveRulesGrade(id,1,marks,feedback);
  expect(result.score).toBe(100);expect(result.revision).toBe(2);expect(result.feedback).toBe(feedback);
  expect(state.gradeCalls.map(c=>c.revision)).toEqual([1,1]);expect(pending()).toEqual([]);
});

test('a missing local outbox and missing review resume the same checked grade',async()=>{
  state.docs.get('submissions/'+id).grade={status:'graded',score:100,mcPoints:0,shortMarks:[10],revision:2,rewardAmount:1,tierIndex:-1};
  const result=await saveRulesGrade(id,1,marks,feedback);
  expect(result.revision).toBe(2);expect(state.gradeCalls).toEqual([{id,revision:1,marks:[10]}]);
  expect(state.docs.get('assessmentReviews/'+id).revision).toBe(2);expect(pending()).toEqual([]);
});

test('a result read denial retains recovery until the saved result can be read',async()=>{
  state.failKeyRead=true;
  await expect(saveRulesGrade(id,1,marks,feedback)).rejects.toMatchObject({assessmentStage:'readGradedResult'});
  expect(state.docs.get('assessmentReviews/'+id).revision).toBe(2);expect(pending()).toHaveLength(1);
  const result=await saveRulesGrade(id,1,marks,feedback);
  expect(result.revision).toBe(2);expect(pending()).toEqual([]);
});

test('an existing conflicting review blocks a stale replay before writes',async()=>{
  state.docs.get('submissions/'+id).grade={status:'graded',score:100,mcPoints:0,shortMarks:[10],revision:2,rewardAmount:1,tierIndex:-1};
  const existing={revision:2,feedback:'另一份已儲存評語',questions:{q1:'已更新'}};
  state.docs.set('assessmentReviews/'+id,existing);
  await expect(saveRulesGrade(id,1,marks,feedback)).rejects.toThrow('批改版本已更新');
  expect(state.gradeCalls).toEqual([]);expect(state.reviewWrites).toBe(0);
  expect(state.docs.get('assessmentReviews/'+id)).toEqual(existing);expect(pending()).toEqual([]);
});

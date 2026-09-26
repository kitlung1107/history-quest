import { readFile } from 'node:fs/promises';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, serverTimestamp, writeBatch, runTransaction } from 'firebase/firestore';
let env;
const claims=email=>({email,email_verified:true,firebase:{sign_in_provider:'google.com'}});
const profile={className:'1A',studentNo:'01',name:'測試學生',nickname:'探險家',avatar:'explorer',configured:false};
const student=()=>env.authenticatedContext('uid-a',claims('student@ctshkpcc.edu.hk')).firestore();
const teacher=()=>env.authenticatedContext('teacher',claims('kitlung1107@gmail.com')).firestore();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-hdc',firestore:{rules:await readFile('firestore.rules','utf8')}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();await setDoc(doc(db,'profiles','s1'),profile);await setDoc(doc(db,'profiles','s2'),{...profile,studentNo:'02'});
 await setDoc(doc(db,'access','student@ctshkpcc.edu.hk'),{studentId:'s1',enabled:true});
 await setDoc(doc(db,'access','approved@gmail.com'),{studentId:'s1',enabled:true});
});});
test('unauthenticated and unlisted school accounts cannot read student profiles',async()=>{
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'profiles','s1')));
 await assertFails(getDoc(doc(env.authenticatedContext('other',claims('other@ctshkpcc.edu.hk')).firestore(),'profiles','s1')));
});
test('approved student can read own profile but not another student or account list',async()=>{
 const db=student();await assertSucceeds(getDoc(doc(db,'profiles','s1')));await assertFails(getDoc(doc(db,'profiles','s2')));await assertFails(getDocs(collection(db,'access')));
});
test('students can customise role but cannot change identity or approve accounts',async()=>{
 const db=student();await assertSucceeds(updateDoc(doc(db,'profiles','s1'),{nickname:'新角色',configured:true}));
 await assertFails(updateDoc(doc(db,'profiles','s1'),{studentNo:'02'}));await assertFails(setDoc(doc(db,'profiles','uid-a'),profile));
 await assertFails(setDoc(doc(db,'access','other@gmail.com'),{studentId:'s1',enabled:true}));
});
test('approved Gmail uses same record; disabled or unverified account is denied',async()=>{
 await assertSucceeds(getDoc(doc(env.authenticatedContext('external',claims('approved@gmail.com')).firestore(),'profiles','s1')));
 await assertFails(getDoc(doc(env.authenticatedContext('fake',{...claims('approved@gmail.com'),email_verified:false}).firestore(),'profiles','s1')));
 await assertSucceeds(updateDoc(doc(teacher(),'access','approved@gmail.com'),{enabled:false}));
 await assertFails(getDoc(doc(env.authenticatedContext('external2',claims('approved@gmail.com')).firestore(),'profiles','s1')));
});
async function submit(db,id='attempt1'){
 return runTransaction(db,async tx=>{const ref=doc(db,'submissions',id);const prev=await tx.get(ref);if(prev.exists())return;tx.set(ref,{studentId:'s1',taskId:'task1',version:'v1',answers:[{question_id:'q1',value:0}],createdAt:serverTimestamp()});tx.set(doc(db,'progress','s1','tasks','task1'),{score:0,progress:100,attemptId:id,syncedAt:serverTimestamp()});});
}
test('submission + progress transaction succeeds and retry is idempotent',async()=>{
 const db=student();await assertSucceeds(submit(db));await assertSucceeds(submit(db));assert.equal((await getDoc(doc(db,'progress','s1','tasks','task1'))).data().score,0);
 await assertSucceeds(getDocs(query(collection(db,'submissions'),where('studentId','==','s1'))));
});
test('student cannot submit as another student, write scores, or replay old progress',async()=>{
 const db=student();await assertSucceeds(submit(db));
 await assertFails(setDoc(doc(db,'submissions','fake'),{studentId:'s2',taskId:'task1',version:'v1',answers:[],createdAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(db,'submissions','attempt1'),{grade:{score:100}}));
 await assertFails(updateDoc(doc(db,'submissions','attempt1'),{answers:[]}));
 await assertFails(updateDoc(doc(db,'progress','s1','tasks','task1'),{score:100}));
 await assertSucceeds(updateDoc(doc(teacher(),'progress','s1','tasks','task1'),{score:80}));
 await assertFails(setDoc(doc(db,'progress','s1','tasks','task1'),{score:0,progress:100,attemptId:'attempt1',syncedAt:serverTimestamp()}));
});
test('teacher can grade, but cannot change original answers via client',async()=>{
 await submit(student());await assertSucceeds(updateDoc(doc(teacher(),'submissions','attempt1'),{grade:{score:80,revision:1}}));
 await assertFails(updateDoc(doc(teacher(),'submissions','attempt1'),{answers:[]}));
});

const applicantEmail='new@gmail.com';
const applicant=()=>env.authenticatedContext('applicant',claims(applicantEmail)).firestore();
const application=()=>({name:'申請學生',className:'1A',studentNo:'03',status:'pending',submittedAt:serverTimestamp()});
async function apply(){await setDoc(doc(applicant(),'accessRequests',applicantEmail),application());}
async function approve(sid='s1',newProfile=false){
 const db=teacher();const batch=writeBatch(db);
 if(newProfile)batch.set(doc(db,'profiles',sid),{...profile,studentNo:'03'});
 batch.set(doc(db,'access',applicantEmail),{studentId:sid,enabled:true});
 batch.update(doc(db,'accessRequests',applicantEmail),{status:'approved',studentId:sid,reviewedAt:serverTimestamp()});
 return batch.commit();
}
test('unapproved verified Google account can submit and read own application only',async()=>{
 await assertSucceeds(apply());
 await assertSucceeds(getDoc(doc(applicant(),'accessRequests',applicantEmail)));
 await assertFails(getDoc(doc(student(),'accessRequests',applicantEmail)));
 await assertFails(getDocs(collection(applicant(),'accessRequests')));
 await assertSucceeds(getDocs(collection(teacher(),'accessRequests')));
 await assertFails(getDoc(doc(applicant(),'profiles','s1')));
});
test('application rejects impersonation, invalid identity, extra privileges and invalid providers',async()=>{
 const db=applicant();
 await assertFails(setDoc(doc(db,'accessRequests','someone@gmail.com'),application()));
 for(const fields of [{name:' '},{className:'7Z'},{studentNo:'../x'},{name:'x'.repeat(51)},{status:'approved'},{studentId:'s1'},{submittedAt:new Date(0)}])
  await assertFails(setDoc(doc(db,'accessRequests',applicantEmail),{...application(),...fields}));
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext('fake',{...claims(applicantEmail),email_verified:false}),env.authenticatedContext('password',{...claims(applicantEmail),firebase:{sign_in_provider:'password'}})])
  await assertFails(setDoc(doc(context.firestore(),'accessRequests',applicantEmail),application()));
 await assertFails(setDoc(doc(student(),'accessRequests','student@ctshkpcc.edu.hk'),application()));
});
test('pending applications cannot be replaced or self approved; rejected applications may be corrected',async()=>{
 await apply();const ref=doc(applicant(),'accessRequests',applicantEmail);
 await assertFails(setDoc(ref,application()));
 await assertFails(updateDoc(ref,{status:'approved',studentId:'s1',reviewedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(teacher(),'accessRequests',applicantEmail),{status:'rejected',reason:'',reviewedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(doc(teacher(),'accessRequests',applicantEmail),{status:'rejected',reason:'請核對學號',reviewedAt:serverTimestamp()}));
 await assertSucceeds(setDoc(ref,{...application(),studentNo:'04'}));
 assert.equal((await getDoc(ref)).data().reason,undefined);
});
test('approval links existing profile and preserves role; approved application cannot be replayed',async()=>{
 await apply();await assertSucceeds(approve());
 assert.deepEqual((await getDoc(doc(applicant(),'profiles','s1'))).data(),profile);
 await assertFails(setDoc(doc(applicant(),'accessRequests',applicantEmail),application()));
 await assertFails(updateDoc(doc(teacher(),'accessRequests',applicantEmail),{status:'rejected',reason:'changed',reviewedAt:serverTimestamp()}));
});
test('new profile, access and approval succeed atomically; missing profile or binding fails',async()=>{
 await apply();
 await assertFails(updateDoc(doc(teacher(),'accessRequests',applicantEmail),{status:'approved',studentId:'s1',reviewedAt:serverTimestamp()}));
 await assertFails(approve('missing'));
 assert.equal((await getDoc(doc(applicant(),'access',applicantEmail))).exists(),false);
 assert.equal((await getDoc(doc(applicant(),'accessRequests',applicantEmail))).data().status,'pending');
 await assertSucceeds(approve('new-student',true));
 assert.equal((await getDoc(doc(applicant(),'profiles','new-student'))).data().studentNo,'03');
});
test('teacher cannot alter student supplied identity during review',async()=>{
 await apply();await assertFails(updateDoc(doc(teacher(),'accessRequests',applicantEmail),{name:'替換姓名',status:'rejected',reason:'核對',reviewedAt:serverTimestamp()}));
});

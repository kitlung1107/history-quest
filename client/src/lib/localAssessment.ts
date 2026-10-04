export const localAssessments=import.meta.env.VITE_ASSESSMENT_EMULATORS==='1';
export const assessmentAuthEmulator=localAssessments&&import.meta.env.VITE_ASSESSMENT_AUTH_EMULATOR==='1';
export const localMockIdentity=localAssessments&&!assessmentAuthEmulator;
// Production remains off until a separately approved build enables this flag.
export const assessmentTransportEnabled=localAssessments||import.meta.env.VITE_RULES_ASSESSMENT_ENABLED==='1';
if(localAssessments&&!['localhost','127.0.0.1'].includes(location.hostname))throw Error('本機批改預覽只可在 localhost 開啟。');
const requested=new URLSearchParams(location.search).get('localRole');
if(localMockIdentity&&requested&&['student','teacher'].includes(requested))localStorage.setItem('hq-assessment-preview-role',requested);
export const localTeacher=localMockIdentity&&localStorage.getItem('hq-assessment-preview-role')==='teacher';
export const localIdentity={uid:localTeacher?'teacher-uid':'learner-uid',studentId:localTeacher?'teacher-uid':'learner',email:localTeacher?'kitlung1107@gmail.com':'learner@prototype.test'};
export const rulesAssessmentEnabled=(task:{assessmentVersion?:string;type?:string})=>assessmentTransportEnabled&&task.type!=='game'&&Boolean(task.assessmentVersion);

export const localAssessments=import.meta.env.VITE_ASSESSMENT_EMULATORS==='1';
if(localAssessments&&!['localhost','127.0.0.1'].includes(location.hostname))throw Error('本機批改預覽只可在 localhost 開啟。');
const requested=new URLSearchParams(location.search).get('localRole');
if(localAssessments&&requested&&['student','teacher'].includes(requested))localStorage.setItem('hq-assessment-preview-role',requested);
export const localTeacher=localAssessments&&localStorage.getItem('hq-assessment-preview-role')==='teacher';
export const localIdentity={uid:localTeacher?'teacher-uid':'learner-uid',studentId:localTeacher?'teacher-uid':'learner',email:localTeacher?'kitlung1107@gmail.com':'learner@prototype.test'};
export const rulesAssessmentEnabled=(task:{assessmentVersion?:string;type?:string})=>localAssessments&&task.type!=='game'&&Boolean(task.assessmentVersion);

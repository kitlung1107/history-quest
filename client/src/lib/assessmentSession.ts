import {getDocFromServer,doc} from 'firebase/firestore';
import {auth,db,OWNER_EMAIL} from './firebase';
import {localMockIdentity,localIdentity,localTeacher,assessmentTransportEnabled} from './localAssessment';
import {verifiedAssessmentIdentity} from './assessmentIdentity';

export function requireAssessmentEnabled(){
  if(!assessmentTransportEnabled)throw Error('新版小測尚未正式啟用，請通知老師。答案及提交 ID 已保留。');
}
export async function assessmentActor(){
  if(localMockIdentity)return {...localIdentity,teacher:localTeacher};
  await auth.authStateReady();
  const user=auth.currentUser;
  if(!user)throw Error('請先登入 Google 帳戶。');
  const token=await user.getIdTokenResult();
  const email=typeof token.claims.email==='string'?token.claims.email:'';
  if(token.claims.email_verified!==true||token.signInProvider!=='google.com')throw Error('請使用已驗證的 Google 帳戶。');
  const access=await getDocFromServer(doc(db,'access',email));
  const actor=verifiedAssessmentIdentity(user.uid,token,access.exists()?access.data():undefined,OWNER_EMAIL);
  if(auth.currentUser?.uid!==user.uid)throw Error('登入帳戶已改變，請重新操作。');
  return actor;
}
export async function requireAssessmentActor(studentId?:string,teacherOnly=false){
  requireAssessmentEnabled();
  const actor=await assessmentActor();
  if(teacherOnly&&!actor.teacher)throw Error('需要教師權限。');
  if(studentId!==undefined&&actor.studentId!==studentId)throw Error('只能提交目前登入帳戶的答案。');
  return actor;
}

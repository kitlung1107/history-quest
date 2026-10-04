export function verifiedAssessmentIdentity(uid:string,token:{claims:Record<string,unknown>;signInProvider:string|null},access:Record<string,any>|undefined,ownerEmail:string){
  const email=typeof token.claims.email==='string'?token.claims.email:'';
  if(token.claims.email_verified!==true||token.signInProvider!=='google.com')throw Error('請使用已驗證的 Google 帳戶。');
  const teacher=email===ownerEmail;
  if(access?.enabled!==true&&!(teacher&&access===undefined))throw Error('此帳戶尚未獲准使用。');
  const studentId=access?access.studentId:uid;
  if(typeof studentId!=='string'||!/^[A-Za-z0-9_-]{1,150}$/.test(studentId))throw Error('帳戶識別資料無效，請通知老師。');
  return{uid,email,studentId,teacher};
}

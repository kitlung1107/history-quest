export function submissionErrorMessage(error:unknown):string{
  const failure=error as {code?:string;message?:string};
  const detail=failure?.message??String(error);
  if(isQuotaError(error))return '資料庫暫時達用量上限。答案及原提交 ID 已暫存在此分頁；請保持分頁開啟，待服務恢復後按「重試同步」。系統已停止自動重試。';
  if(failure?.code==='permission-denied')
    return `${detail} 規則驗證拒絕。答案與提交 ID 已保留；需修正规則後再續傳同一提交。`;
  return `${detail} 答案仍保留；連線恢復後按「重試同步」續傳同一提交。`;
}
export function isQuotaError(error:unknown){
  const code=(error as {code?:string})?.code??'';
  return code==='resource-exhausted'||code==='firestore/resource-exhausted';
}

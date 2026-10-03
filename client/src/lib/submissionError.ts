export function submissionErrorMessage(error:unknown):string{
  const failure=error as {code?:string;message?:string};
  const detail=failure?.message??String(error);
  if(failure?.code==='permission-denied')
    return `${detail} 規則驗證拒絕。答案與提交 ID 已保留；需修正规則後再續傳同一提交。`;
  return `${detail} 答案仍保留；連線恢復後按「重試同步」續傳同一提交。`;
}

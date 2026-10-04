// Review only: consumes an approved snapshot, never connects or writes.
export function assessmentCutoverPlan({tasks,submissions=[],entries=[],policies={}}){
  if(!Array.isArray(tasks)||!tasks.length||new Set(tasks.map(t=>t.taskId)).size!==tasks.length)throw Error('請提供不重複的轉換任務清單。');
  return{mode:'review-only',writes:false,backfill:false,requiresApproval:true,requiresProtocolGuardDeployment:true,tasks:tasks.map(task=>{
    if(task.type==='game'||!/^[A-Za-z0-9_-]{1,150}$/.test(task.taskId)||!/^[A-Za-z0-9_-]{1,100}$/.test(task.version))throw Error('只能指定有效的小測任務及新版本。');
    const policy=policies[task.taskId];
    if(policy&&policy.source!=='assessment'&&policy.source!=='none')throw Error('不能停用遊戲獎勵 policy。');
    const pending=submissions.filter(s=>s.taskId===task.taskId&&s.protocol===undefined&&(s.grade?.status!=='graded'||!entries.some(e=>e.studentId===s.studentId&&e.taskId===s.taskId&&e.amount>0)));
    return{taskId:task.taskId,newVersion:task.version,legacyReviewAttemptIds:pending.map(s=>s.id),existingPositiveEntries:entries.filter(e=>e.taskId===task.taskId&&e.amount>0).length,
      policyProposal:pending.length?'保持原 policy，先按原流程審查及完成舊提交；協定保護會排除新版。':'批准後可停用本任務舊 assessment policy。',
      preserveTaskId:true,preservePositiveLedger:true,preserveHistoricalCatalogue:true,convertOldAnswers:false};
  })};
}

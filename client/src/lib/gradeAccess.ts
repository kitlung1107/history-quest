export type GradeIdentity = { teacher?: boolean; profile?: { className?: string } | null } | null | undefined;

// The roster is authoritative; selected navigation state never grants access.
export function studentGrade(value?: string): number | null {
  const text = value?.trim().toUpperCase() || '';
  const match = /^(?:S|中)?([1-6一二三四五六])(?:[A-E]|班)?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) || '一二三四五六'.indexOf(match[1]) + 1;
}
export function canPlayGrade(identity: GradeIdentity, grade: number): boolean {
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return false;
  if (identity?.teacher) return true;
  const own = studentGrade(identity?.profile?.className);
  return own !== null && (own <= 3 ? grade === own : grade >= 4 && grade <= own);
}
export function canSeeGrade(identity: GradeIdentity, grade: number): boolean {
  const own = studentGrade(identity?.profile?.className);
  return Boolean(identity?.teacher || own === null || own <= 3 || grade >= 4);
}
export function gradeLockMessage(identity: GradeIdentity): string {
  const own = studentGrade(identity?.profile?.className);
  return own ? `此級別暫未開放予中${'一二三四五六'[own - 1]}學生遊玩` : '未能確認你的年級，請聯絡老師核對班別。';
}

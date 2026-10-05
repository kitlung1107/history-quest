export type GradeIdentity = { teacher?: boolean; testingAccount?: boolean; user?: { email?: string | null; emailVerified?: boolean }; profile?: { className?: string } | null } | null | undefined;

export function hasAllGradeAccess(identity: GradeIdentity): boolean {
  return Boolean(identity?.teacher || (identity?.user?.emailVerified === true && identity.testingAccount === true));
}

// The roster is authoritative; selected navigation state never grants access.
export function studentGrade(value?: string): number | null {
  const text = value?.trim().toUpperCase() || '';
  const match = /^(?:S|中)?([1-6一二三四五六])(?:[A-E]|班)?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) || '一二三四五六'.indexOf(match[1]) + 1;
}
export function canPlayGrade(identity: GradeIdentity, grade: number): boolean {
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return false;
  if (hasAllGradeAccess(identity)) return true;
  const own = studentGrade(identity?.profile?.className);
  return own !== null && (own <= 3 ? grade === own : grade >= 4 && grade <= own);
}
export function canSeeGrade(identity: GradeIdentity, grade: number): boolean {
  // Grade navigation is visible to everyone; canPlayGrade still controls access.
  const own = studentGrade(identity?.profile?.className);
  return Boolean(hasAllGradeAccess(identity) || own === null || own <= 3 || grade >= 1);
}
export function gradeLockMessage(identity: GradeIdentity): string {
  const own = studentGrade(identity?.profile?.className);
  return own ? `此級別暫未開放予中${'一二三四五六'[own - 1]}學生遊玩` : '未能確認你的年級，請聯絡老師核對班別。';
}

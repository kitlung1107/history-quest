import { LockKeyhole } from 'lucide-react';
import { gradeLockMessage, type GradeIdentity } from '@/lib/gradeAccess';
export default function GradeLock({ identity }: { identity: GradeIdentity }) {
  return <div className="grade-lock" role="status"><LockKeyhole aria-hidden="true" /><p>{gradeLockMessage(identity)}</p><small>請使用年級選單切換至已開放的級別。</small></div>;
}

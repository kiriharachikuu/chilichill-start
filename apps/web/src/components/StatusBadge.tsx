import { SUBMISSION_STATUS_LABELS, type SubmissionStatus } from '@spaceport/shared';
import Badge, { type BadgeTone } from './Badge';

const TONES: Record<SubmissionStatus, BadgeTone> = {
  PENDING: 'amber',
  APPROVED: 'mint',
  REJECTED: 'coral',
};

export default function StatusBadge({ status }: { status: SubmissionStatus }) {
  return <Badge tone={TONES[status]}>{SUBMISSION_STATUS_LABELS[status] ?? status}</Badge>;
}

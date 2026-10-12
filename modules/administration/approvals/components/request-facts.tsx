import Typography from '@mui/material/Typography';
import type { Loaded } from '@/lib/api/load';
import type { ProblemView } from '@/lib/api/problem';
import { shortId } from '@/lib/format';
import { MAKER_NOT_PERMITTED, MAKER_NOT_RECORDED, READ_FAILED } from '../approval-copy';
import { isSameUser } from '../approval-rules';
import type { MakerEvent } from '../approval-service';

/** A fact whose read failed: said so, with its reference, never backend text (rule 9). */
export function ReadFailed({ problem }: { problem: ProblemView }) {
  return (
    <>
      {READ_FAILED}
      {problem.requestId && (
        <Typography
          variant="caption"
          component="span"
          sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}
        >
          Reference: {problem.requestId}
        </Typography>
      )}
    </>
  );
}

/** Who asked (BG-08): not permitted, failed, not recorded, or the name (the short id when the user
 * lookup can't name them), marked "(you)" for the signed-in user. Server-Component safe. */
export function MakerValue({
  maker,
  name,
  me,
}: {
  /** `null`: no `audit.view`, so nothing was read. */
  maker: Loaded<MakerEvent | null> | null;
  name: string | null;
  me: string;
}) {
  if (maker === null) return MAKER_NOT_PERMITTED;
  if (!maker.ok) return <ReadFailed problem={maker.problem} />;
  const actor = maker.value?.actorUserId ?? null;
  if (actor === null) return MAKER_NOT_RECORDED;
  return `${name ?? shortId(actor)}${isSameUser(actor, me) ? ' (you)' : ''}`;
}

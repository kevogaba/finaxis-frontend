import Typography from '@mui/material/Typography';
import type { ProblemView } from '@/lib/api/problem';
import type { ActorRef } from '@/lib/api/wire';
import { shortId } from '@/lib/format';
import { READ_FAILED } from '../approval-copy';
import { isSameUser } from '../maker-checker';

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

/** Who asked (BG-08): the record's maker by name (its short id when it has none), "You (…)" for
 * the signed-in user, and "—" when the record names nobody (the system, or someone the caller may
 * not see). */
export function makerLabel(maker: ActorRef, me: string): string {
  if (maker === null) return '—';
  const name = maker.displayName ?? shortId(maker.id);
  return isSameUser(maker.id, me) ? `You (${name})` : name;
}

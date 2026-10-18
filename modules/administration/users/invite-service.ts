import 'server-only';
import type { UserSummary } from './user-contract';
import { SCAN_CEILING } from './user-rules';
import { listUsers } from './user-service';

const PAGE_SIZE = 100;
// ponytail: at most SCAN_CEILING users (5 pages of 100) per check, like 10's membership search.
const PAGES = SCAN_CEILING / PAGE_SIZE;

/** The first user `GET /tenant/users?q=` lists that `matches` accepts, within the ceiling. Its `q` is
 * a case-insensitive substring over username, email and name with `%` and `_` as wildcards
 * (contract §A), so the hits are a superset and the caller compares exactly. */
async function scanUsers(
  q: string,
  matches: (user: UserSummary) => boolean,
): Promise<UserSummary | null> {
  for (let page = 0; page < PAGES; page += 1) {
    const result = await listUsers({ q, page, size: PAGE_SIZE });
    const match = result.items.find(matches);
    if (match) return match;
    if (!result.page.hasNext) return null;
  }
  return null;
}

/**
 * The member of this institution whose email this is, in any membership status (BG-28: a revoked
 * one still blocks the email); null when none is found within the ceiling. `GET /tenant/users`
 * lists everyone with a membership here; the email is compared exactly, without letter case. One
 * endpoint, no read per hit (BG-09; Ruling 1).
 *
 * A scan cut at the ceiling answers null, as if free (L1's capped scan): an exact email as `q` can't
 * realistically match 500 users, and the backstop is the invitation itself, which is posted first
 * and refused by the platform with a 500 for an email already here, so a member the scan missed is
 * never invited twice; the wizard then shows that failure with its reference.
 *
 * Every read failure REJECTS (L1): the route handler and the action decide what a failure means.
 */
export async function findMemberByEmail(email: string): Promise<UserSummary | null> {
  const q = email.trim();
  if (!q) return null;
  const wanted = q.toLowerCase();
  return scanUsers(q, (user) => user.email.toLowerCase() === wanted);
}

/**
 * The member of this institution whose username this is, compared exactly without letter case;
 * null when none is found within the ceiling. Read only after a failed invitation whose email is
 * free here, to name an in-tenant username collision (BG-07; Ruling 15); one held by an account in
 * another institution can't be seen from here. Rejects on any read failure, as above.
 */
export async function findMemberByUsername(username: string): Promise<UserSummary | null> {
  const q = username.trim();
  if (!q) return null;
  const wanted = q.toLowerCase();
  return scanUsers(q, (user) => user.username.toLowerCase() === wanted);
}

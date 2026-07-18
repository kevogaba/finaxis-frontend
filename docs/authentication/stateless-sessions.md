# Stateless sessions

Better Auth runs with no `database` option configured — there is no application
authentication database. Session state lives entirely in an encrypted, `HttpOnly` cookie.

## Policy

```
Session lifetime:          8 hours
Cookie strategy:           jwe (encrypted)
Cookie refresh:            enabled (refreshCache: true) — refreshes before expiry
Session version:           1
Cookie prefix:             finaxis
```

8 hours (not the library's 7-day default) was chosen deliberately for an enterprise finance
system — see `AGENTS.md` for the rule against defaulting to long-lived sessions.

## Trade-offs — read before assuming otherwise

- **No per-session database lookup.** Session validity is checked by decrypting and verifying
  the cookie's signature/expiry, not by looking up a session row.
- **Logout cannot centrally revoke every already-issued cookie.** Local sign-out clears the
  browser's cookie and Keycloak's SSO session (see `app/api/auth/logout/route.ts`), but there is
  no way to invalidate a _specific_ already-issued encrypted session cookie short of it expiring
  or a global version bump (below). If a session cookie were somehow exfiltrated, it remains
  valid until its `expiresIn` elapses.
- **Changing `session.cookieCache.version` invalidates every existing session at once.** This is
  the only "kill switch" available in this configuration — use it for a security incident, not
  routine deploys.
- **Account-cookie size is a real risk, not a theoretical one.** `account.storeAccountCookie:
true` keeps the Keycloak account/token data in an encrypted cookie too. Large ID tokens (many
  realm/client roles, many group memberships) can push total cookie size toward browser
  (~4KB per cookie, and combined-header limits) and reverse-proxy header-size limits. Test with
  this realm's actual token sizes before adding many role/group claim mappers — see
  `docs/authentication/keycloak.md`'s optional-claims list — and watch for `431 Request Header
Fields Too Large` in server logs if it's exceeded.
- **No fine-grained session administration UI.** There is no "list my active sessions" or
  "revoke this specific device" feature in this configuration.

## When to move off pure-stateless

If any of the following become requirements, add Redis (or a database) as
`secondaryStorage`/`database` rather than trying to stretch the stateless model further:

- Centrally revoking one specific user's session before it expires.
- Durable, cross-restart session administration ("view all active sessions").
- Token payloads that push cookie size past practical limits.

This is a known, intentional trade-off for this iteration — not an oversight.

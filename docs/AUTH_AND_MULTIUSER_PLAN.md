# VAJRA: multi-user auth (admin oversight, per-user chat isolation)

> This document **supersedes** the single-operator auth sketch in
> `docs/IMPLEMENTATION_PLAN.md` Phase 6.4 (one shared admin password, no roles, no per-user
> data) — that design predates the decision to support separate users.

## Context

The workbench currently has zero authentication: `/login` is a static form with hardcoded
`admin`/`sovereign2026` credentials, a `setTimeout` fake redirect, and no session, cookie, or
backend check of any kind — every API route is reachable by anyone who can reach the process.
Chat history (`conversations` + `messages` tables, built in the previous pass) has no owner
column at all: it is one shared history for whoever opens the app.

The ask now is real multi-user access control: an **admin** who can see and monitor everything
(all users' conversations, all runs, system configuration), and **regular users** who can each
only see their own chats and their own runs. This is a materially different shape than the
single-shared-password design sketched earlier, so it gets its own plan rather than amending
that one.

Decisions taken (asked via `AskUserQuestion`, both recommended options chosen):
- **Admin sees full chat content**, not just usage metadata — an admin can open and read any
  user's conversation, the same as their own.
- **Admin-provisioned accounts**: no public self-service sign-up. An admin creates a user from
  an Admin > Users page and hands them a one-time generated password.

### Outcome

Every route requires a valid session except `/api/system/ping` and `/api/auth/*`. A regular
user's conversations, messages, and runs are invisible to every other non-admin user. An admin
can read any user's chats, manage accounts, and see who is currently logged in. Nothing here
adds an external dependency — hashing and sessions are stdlib (`hashlib`, `hmac`, `secrets`),
consistent with the project's no-new-dependency posture for infrastructure like this.

---

## Data model

### New tables (created automatically by `SQLModel.metadata.create_all` — no migration needed)

**`users`** (`UserRecord`, `vajra/store/models.py`)
- `id` (uuid pk), `username` (unique, indexed), `password_hash` (str, see below), `role`
  (`admin` | `user`, new `UserRole` enum in `core/enums.py`), `display_name`, `enabled` (bool),
  `must_change_password` (bool), `created_at`, `created_by` (nullable FK to `users.id` — which
  admin created the account), `last_login_at` (nullable, measured not assumed).

**`sessions`** (`SessionRecord`, `vajra/store/models.py`)
- `id` (uuid pk), `user_id` (FK, indexed), `token_hash` (sha256 hex of the opaque token,
  unique+indexed — the raw token is never stored), `created_at`, `expires_at`, `last_seen_at`,
  `revoked` (bool). Server-side sessions (not JWT) are chosen deliberately: instantly revocable
  on logout or on an admin disabling a user, and — because they're real rows — an admin's
  "who's logged in right now" view (`GET /api/admin/sessions`) is a genuine query, not another
  fabricated number.

### Additive columns (via the existing `schema_sync.py` — `sync_additive_columns()`, already
wired into `Database.init()` behind `settings.database.auto_migrate`; see
`apps/api/vajra/store/schema_sync.py` and the routing-policy self-heal in `startup()` for the
established pattern of a safe, idempotent, backward-compatible schema change on this project)

- `conversations.user_id: str | None` (FK, indexed) — [store/models.py:193](apps/api/vajra/store/models.py#L193)
- `runs.user_id: str | None` (FK, indexed) — [store/models.py:264](apps/api/vajra/store/models.py#L264)

Both nullable forever at the schema level. `NULL` means "created before auth existed" — treated
as admin-only/legacy, never assigned to a regular user. A one-time backfill in `startup()`
(same place and pattern as the routing-policy repair block already there,
[dependencies.py:159-227](apps/api/vajra/core/dependencies.py#L159-L227)) assigns every
pre-existing `NULL` row to the bootstrap admin account the first time this boots against an
existing database, so nothing is silently orphaned.

`RunRecord` gets its own `user_id` rather than only deriving ownership by joining through
`conversation_id`: not every run is conversation-linked (ad-hoc runs, direct API use), and
ownership needs to be resolvable with no join on every authorization check.

---

## Backend: passwords, sessions, auth service

**`vajra/auth/passwords.py`** (new)
- `hash_password(password: str) -> str` — `hashlib.pbkdf2_hmac("sha256", password.encode(),
  salt, iterations=600_000)` with a fresh `secrets.token_bytes(16)` salt per password, encoded
  as `pbkdf2_sha256$600000$<salt_hex>$<hash_hex>`.
- `verify_password(password: str, stored: str) -> bool` — re-derives with the stored salt and
  iteration count, compares with `hmac.compare_digest` (constant-time).

**`vajra/auth/sessions.py`** (new) — `SessionService(database)`
- `create(user_id) -> tuple[str, SessionRecord]` — raw token = `secrets.token_urlsafe(32)`;
  only `hashlib.sha256(raw_token).hexdigest()` is persisted. Returns the raw token once, to be
  set as the cookie value; it is never retrievable from storage again (same
  can't-recover-the-secret shape as the password hash).
- `authenticate(raw_token) -> UserRecord | None` — looks up by hash, rejects if
  `revoked`/`expires_at` has passed/the owning user is `disabled`; updates `last_seen_at`.
- `revoke(raw_token)`, `revoke_all_for_user(user_id)` (called on logout, on password change, and
  when an admin disables a user).
- Sliding 12h idle expiry, 30-day absolute cap. "Keep me signed in" (already in the login UI,
  [login/page.tsx:13](apps/web/app/login/page.tsx#L13)) chooses between a persistent cookie
  (`Max-Age` set, up to the 30-day cap) and a browser-session cookie (no `Max-Age`) — the
  server-side cap applies either way.

**`vajra/store/repositories/users.py`** (new) — `UserRepository` (CRUD + `get_by_username`),
`SessionRepository` (CRUD + `get_by_token_hash`, `delete_expired` housekeeping called
opportunistically on login).

**`vajra/auth/service.py`** (new) — `AuthService(database, sessions)`, the single place that
combines both repos:
- `login(username, password) -> tuple[str, UserRecord]` — raises `Unauthorized` (new
  `VajraError` subclass → 401, `core/exceptions.py`) on bad credentials or a disabled account,
  without distinguishing "wrong username" from "wrong password" in the message.
- `logout(raw_token)`, `me(raw_token) -> UserRecord | None`.
- `create_user(username, role, created_by) -> tuple[UserRecord, str]` — generates a one-time
  password (`secrets.token_urlsafe(9)`, human-shareable), `must_change_password=True`.
- `list_users()`, `set_enabled(user_id, enabled)` (also revokes sessions on disable),
  `reset_password(user_id) -> str`, `change_password(user_id, old, new)` (verifies `old` unless
  called by admin as a forced reset).

**Bootstrap**: in `startup()`, right after the routing-policy block, if `users` is empty, create
one `admin` account with a generated password (`secrets.token_urlsafe(12)`),
`must_change_password=True`, and log it once at `INFO` clearly marked as a one-time credential —
mirrors the pattern the previous plan already described for the single-operator case, now
generalized.

---

## Backend: wiring auth into every route

**`vajra/core/dependencies.py`**
- Add `auth: AuthService` to `AppContext`; construct it in `build_context()` alongside
  `conversations` (same hoisted-local pattern already used there,
  [dependencies.py:94-97](apps/api/vajra/core/dependencies.py#L94-L97)).
- `get_current_user(request: Request, context: Context) -> UserRecord` — reads the `session`
  cookie, calls `auth.me()`; raises the new `Unauthorized` on missing/invalid/expired.
  `CurrentUser = Annotated[UserRecord, Depends(get_current_user)]`.
- `require_admin(user: CurrentUser) -> UserRecord` — raises `Forbidden` (403) unless
  `user.role == UserRole.ADMIN`. `AdminUser = Annotated[UserRecord, Depends(require_admin)]`.
- `require_owner_or_admin(resource_user_id: str | None, user: UserRecord) -> None` — one small
  helper (new `vajra/auth/authorization.py`) used everywhere ownership needs checking, instead
  of duplicating the `record.user_id not in (None, user.id) and user.role != ADMIN` branch at
  every call site. Raises `NotFound` (not `Forbidden`) for a non-owner, non-admin request, so a
  conversation/run ID that belongs to someone else is indistinguishable from one that doesn't
  exist — a deliberately defensive default, not something to prompt on.

**`vajra/api/auth.py`** (new router, exempt from the global auth dependency)
- `POST /api/auth/login` → sets the `session` cookie (`httponly=True`, `samesite="strict"`,
  `secure=settings.auth.cookie_secure`), returns the user (minus password hash).
- `POST /api/auth/logout` → revokes the session, clears the cookie.
- `GET /api/auth/me` → current user or 401.
- `POST /api/auth/change-password`.

**`vajra/api/admin.py`** (new router, `Depends(require_admin)` at the router level)
- `GET /api/admin/users`, `POST /api/admin/users`, `PATCH /api/admin/users/{id}` (role/enabled),
  `POST /api/admin/users/{id}/reset-password`, `GET /api/admin/sessions` (real, queried "who's
  logged in now" — the concrete answer to "admin can monitor everything" for accounts).

**Router-level guarding** — every existing router in
[api/__init__.py](apps/api/vajra/api/__init__.py) adds one dependency at construction:
- `conversations`, `runs`, `knowledge` (Document/Image/Data Analysis, Knowledge Graph pages) get
  `Depends(get_current_user)` — reachable by any signed-in user, scoped to their own data inside
  the handler (see next section).
- `models`, `runtimes`, `routing`, `network`, `sandbox`, `tools`, `audit` — operator/infra
  surfaces, not per-user chat data — get `Depends(require_admin)`.
- `system` keeps `/api/system/ping` open (health checks, no auth); anything else under it
  (`/api/system/self-audit`, etc., if present) becomes admin-only alongside the others.
- `analytics` — admin-only for the fleet-wide view; a user-scoped variant is covered under
  Frontend below rather than a second endpoint.

This is a uniform two-line change per router file (`APIRouter(..., dependencies=[Depends(...)])`),
the same "small repeated change, one pattern, list representative files" shape the previous plan
used for event-type additions — no need to touch every handler body for the admin-only routers.

---

## Backend: scoping conversations and runs to their owner

**`vajra/orchestrator/conversations.py`** (`ConversationService`) — `create`, `list`, `get`,
`detail`, `update`, `delete` gain a `requesting_user: UserRecord` parameter:
- `create` sets `user_id = requesting_user.id` on the new `ConversationRecord`.
- `list` filters to `user_id == requesting_user.id` unless the caller is admin (admin may pass
  an explicit `user_id` filter to view one user's list, or omit it for "all").
- `get`/`detail`/`update`/`delete` call `require_owner_or_admin(record.user_id, requesting_user)`
  right after loading the record, before returning/mutating anything.

**`vajra/api/conversations.py`** — every handler adds `user: CurrentUser` and threads it through;
`list_conversations` accepts an admin-only `?user_id=` query filter.

**`vajra/orchestrator/service.py`** (`RunOrchestrator.create`) — `user_id` comes from the
authenticated caller (passed down from the API handler), **never** from the request body — same
principle already applied to routing decisions never trusting client-declared capabilities.
Setting `RunRecord.user_id` at creation
([service.py:1226](apps/api/vajra/orchestrator/service.py) — the `RunRecord(...)` construction
inside `create()`) is a one-line addition next to the existing `attachments=...` field.

**`vajra/api/runs.py`** — `create_run`, `list_runs`, `get_run`, `get_run_steps`,
`stream_run_events`, `cancel_run`, `list_run_artifacts` all gain `user: CurrentUser` and call
`require_owner_or_admin(run.user_id, user)` after the existing `context.orchestrator.get(run_id)`
lookup each already does (e.g. [runs.py:71](apps/api/vajra/api/runs.py#L71) in
`stream_run_events`) — the ownership check slots into an existing "does this run exist" call, no
new query. `list_runs` defaults to the caller's own runs; admin may pass `?user_id=`.

---

## Frontend

- **`lib/api.ts`** — `apiFetch()` is the single fetch chokepoint every call already goes
  through; add `credentials: 'include'` there once (cookies then flow on every request
  automatically). Add `api.login()`, `api.logout()`, `api.getCurrentUser()`,
  `api.changePassword()`, and the admin user/session-management calls.
- **`middleware.ts`** (new, project root) — redirects to `/login` when the `session` cookie is
  absent, for any route other than `/login`. This is a UX convenience only; the real
  authorization boundary is server-side on every API call regardless of what the middleware lets
  through.
- **`app/login/page.tsx`** — replace the hardcoded `admin`/`sovereign2026` state
  ([login/page.tsx:10-11](apps/web/app/login/page.tsx#L10-L11)) and the fake
  `setTimeout` submit ([login/page.tsx:16-23](apps/web/app/login/page.tsx#L16-L23)) with a real
  `api.login()` call, real error display (wrong credentials, disabled account), and a
  must-change-password redirect to a small change-password form on first login.
- **`stores/authStore.ts`** (new) — holds `currentUser` (id, username, role), populated once via
  `GET /api/auth/me` on app load. Used only to *shape the UI*; the backend enforces regardless,
  so this store is not a trust boundary.
- **`components/shell/SideNav.tsx`** — filter `navItems`
  ([SideNav.tsx:33-46](apps/web/components/shell/SideNav.tsx#L33-L46)) to admin-only entries
  (Model Management, Agent Workflows, Routing Studio, Network & Sovereignty, System Analytics,
  Audit Logs) versus everyone (Chat, Document/Image/Data Analysis, Knowledge Graph, Runs,
  Settings); add an "Admin · Users" entry visible only to `role === 'admin'`. Fix "Sign Out"
  ([SideNav.tsx:141-148](apps/web/components/shell/SideNav.tsx#L141-L148)), which currently just
  links to `/login`, to call `api.logout()` first.
- **`app/admin/users/page.tsx`** (new, admin-only) — list users (username, role, enabled, last
  login), create user (shows the one-time password once, copyable, never retrievable again),
  enable/disable, reset password, and a live active-sessions panel — the concrete surface for
  "admin can monitor everything" on the account side.
- **`app/runs/page.tsx`** — unchanged for a regular user (already shows "their" runs, now
  actually enforced server-side); admin gains a user-filter dropdown sourced from
  `GET /api/admin/users`.

---

## Rollout sequencing

Land backend auth, scoping, and tests first — routes then 401 without a session, but nothing
breaks yet because the frontend isn't sending cookies. Land the frontend (login, middleware,
store, nav filtering) in the same merge, not a later one: a backend that requires auth with no
frontend login flow is a broken app, the same "big-bang, must ship together" risk the previous
plan flagged for the mock-deletion pass.

---

## Verification

**Backend**
- `tests/unit/test_passwords.py` — hash/verify round-trip; wrong password rejected; two hashes
  of the same password differ (salted); `verify_password` runs in constant time relative to
  where the mismatch occurs (i.e. uses `hmac.compare_digest`, not `==`).
- `tests/unit/test_sessions.py` — create → authenticate resolves the right user; expired
  session rejected; revoked session rejected; disabling the owning user invalidates the session;
  the raw token cannot be recovered from what's stored.
- `tests/integration/test_auth.py` — bootstrap admin can log in and receives a cookie; wrong
  password → 401; `/api/auth/me` with no cookie → 401; `/api/runs` with no cookie → 401;
  `/api/admin/users` as a non-admin → 403; logout invalidates the cookie for a subsequent call.
- `tests/integration/test_conversation_ownership.py` — user A cannot see, patch, or delete user
  B's conversation (404, per the defensive default above); admin can read both; creating a run
  with a `conversation_id` owned by a different user is rejected before the run is created, not
  after.
- Extend the vision-preprocessing run tests
  ([test_vision_preprocessing.py](apps/api/tests/integration/test_vision_preprocessing.py)) with
  an assertion that `run.user_id` is the authenticated caller regardless of what (if anything) is
  in the request body — the same "never trust client-declared identity" property already proven
  for routing decisions.
- Full suite stays green: `cd apps/api && ruff check . && pytest -v`.

**Frontend**
- `npx tsc --noEmit` and `npx next build` both clean, matching the standard already held all
  session.
- Manual smoke: log in as the bootstrap admin, create a second `user`-role account, log in as
  that user in a separate browser profile, confirm: the user's nav has no admin-only entries;
  the user cannot navigate to an admin page by URL (403 surfaces as a real error state, not a
  blank page); the user's `/runs` and chat history show only their own; log back in as admin and
  confirm their conversations and runs *are* visible, full content, from the Admin Users page.
- Confirm a logged-out browser hitting any page other than `/login` is redirected there, and
  that hitting an API route directly with curl and no cookie returns a real 401 problem+json
  body, not a silent 200.

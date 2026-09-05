# Porting lessons from `rusty4444/hermes-android`

Research baseline: upstream commit `0ea693890d00a7f902b6d063337c4c76743d8fbc` (Flutter package `2.1.0+2140`) and the completed Remote Gateway merge discussion in issue [#81](https://github.com/rusty4444/hermes-android/issues/81). The reference clone is kept outside this repository at `C:\Users\PC\Documents\Coding Projects\Hermes Android Reference`.

The repository identifies its license as MIT in its README. We should preserve attribution when adapting non-trivial implementation details; we should port contracts and architecture into our React/Tauri code rather than importing Flutter/Android code into the cross-platform product.

## What issue #81 established

The central conclusion is directly applicable: Hermes mobile chat should use the same Desktop Dashboard/Gateway JSON-RPC transport as Hermes Desktop. `/v1/chat/completions` is only a legacy compatibility path. The unified gateway path provides server-owned session identity, generated titles, pushed tool/approval/clarification events, attachments, per-session config, and durable recovery.

The merged edition was independently reviewed and tested in the issue thread. Its strongest reusable asset is not a screen widget; it is the explicit gateway contract and fake-gateway test suite.

## Architecture to port

### 1. One durable gateway connection

Use one authenticated `/api/ws` connection per host, not one socket per RPC or prompt. Route JSON-RPC responses by request ID and pushed events by `session_id`. A `prompt.submit` response means accepted, not complete; the client waits for a terminal event.

Implemented in this project now:

- `src/gateway.ts`: persistent JSON-RPC connection, `gateway.ready`, request routing, session-scoped events, terminal turn handling, and `session.interrupt`.
- `src/hermes.ts`: shared gateway instance used by roster RPCs and chat submission.
- `src/gateway.test.ts`: gateway-envelope and terminal-event regression coverage.

### 2. Secure authentication ladder

The reference client supports:

- password login via `/auth/password-login` and the `hermes_session_at` cookie;
- proxied authenticated dashboards;
- insecure local bootstrap token only for explicitly insecure/local dashboards;
- short-lived, single-use WebSocket tickets from `/api/auth/ws-ticket` for secured gateways;
- credentials in platform secure storage, with verified migration from legacy plaintext storage.

Our current local Windows bridge still scrapes the loopback SPA token. That remains acceptable only for owner-machine development. Before Android/iOS distribution, implement password/pairing login in Rust, mint WS tickets natively, and store revocable device credentials in Tauri Stronghold/Keychain/Keystore. Never put a password, cookie, or dashboard token in the React layer or query logs.

### 3. Capability negotiation

Treat `gateway.ready` as the authority for features. Pin its capability payload for the life of a socket and fail closed if it changes unexpectedly. Gate attachments, recovery, projects, and response dialogs on advertised capabilities instead of app-version guesses.

### 4. Durable turn journal and recovery

The reference implementation persists an intent before `prompt.submit`, associates `client_turn_id`, `turn_id`, `message_id`, ordered `seq`, and a digest with the host/session, then reconciles with `turn.recover`/`turn.status`. It never blindly resends after an ambiguous disconnect, even if the server reports `safe_to_resubmit`; the user remains in control.

This is the next highest-priority transport feature for Hermes Mobile. Required acceptance tests:

- background/foreground during an active turn;
- socket loss before and after prompt acknowledgement;
- duplicate and out-of-order events;
- terminal snapshot after missed deltas;
- journal write failure sends zero prompts;
- exactly one submit for one persisted intent.

### 5. Complete interactive event projection

Project gateway events into typed UI models for:

- assistant message start/delta/complete;
- reasoning summaries (never hidden chain-of-thought);
- tool start/progress/result/failure;
- approvals and `approval.respond`;
- clarification and `clarify.respond`;
- masked sudo/secret prompts;
- subagent lifecycle;
- background completion, reviews, and notifications.

The chat reducer must be idempotent so replay and recovery snapshots produce the same UI as live events.

### 6. Attachments

Use `file.attach` sequentially, preserve order, and append returned canonical `ref_text` values to the prompt. The reference implementation adds a file-backed draft cache, retry/removal/reordering, metadata-sanitized images, limits, and a manifest digest used by turn recovery. Build this in shared TypeScript plus native Tauri file/secure-storage boundaries so Android, iOS, and desktop share behavior.

### 7. Session operations and per-chat configuration

Port these gateway methods behind capability checks:

- `session.create`, `session.resume`, `session.interrupt`;
- `session.title`, `session.branch`, deletion/search through verified Dashboard contracts;
- `config.get`/`config.set` for model and reasoning effort scoped to a session (`--session`), never a surprise profile-wide mutation.

### 8. Mobile UX details worth preserving

- Open long conversations at the latest content.
- Follow streaming only while the reader is near the end.
- Show a stable “Latest” affordance and unread count when the reader scrolls away.
- Copy/select, edit-and-resend, regenerate, export, read aloud, and Stop.
- Background completion notifications.
- Accessible attachment order/removal and semantic status labels.

## What not to copy wholesale

- Flutter widgets and Android-specific platform code: this project is React + Tauri v2 for Android, iOS, and desktop.
- The legacy SSE `/v1/chat/completions` path: retain only if a deliberate compatibility mode is later required.
- ATLAS-specific integrations: optional and disabled by default upstream; not part of generic Hermes parity.
- Any upstream assumptions that conflict with Bot Mode canonical chats. This app’s Bots roster must continue using `profiles.list` canonical session data, not arbitrary all-session REST rows.

## Delivery order

1. Durable connection and correct terminal semantics — started.
2. Capability registry and secure WS-ticket authentication.
3. Typed event reducer and activity/approval/clarification UI.
4. Turn journal and recovery contract tests.
5. Attachments and native cache.
6. Session actions and per-chat model/reasoning controls.
7. Background notifications and lifecycle recovery.
8. Android validation on this Windows PC; iOS compile/sign validation on macOS.

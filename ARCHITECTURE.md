# Hermes Mobile architecture

## Product boundary

This application is a **remote client** for an already-running Hermes Agent backend. It never embeds a model, provider credential, agent runtime, shell, or tool executor. The desktop/backend remains the sole execution authority.

## Chosen stack

- **React + TypeScript + Vite** for a fast shared UI layer.
- **Tauri v2** for Windows/macOS/Linux, Android, and iOS packaging from the same source tree.
- Native capabilities stay behind Tauri plugins (secure store, dialog; later notification, biometric and deep-link plugins). The web build is also usable as a development shell/PWA candidate.

This follows the important Readest pattern—web frontend plus Tauri v2 shell—without inheriting its ebook-specific Next.js/worker complexity. Platform integrations must use runtime Tauri capability detection with browser-safe fallbacks, rather than build-time-only flags. Web and Tauri configuration stay separate (`.env.web` / `.env.tauri`, neither committed), and Tauri capabilities, asset scopes, CSP, and deep-link allowlists stay minimal and explicit.

## Connectivity: secure by default

1. Hermes remains `127.0.0.1:9119` on the owner machine.
2. The owner joins the computer and phone to **Tailscale** (recommended), or uses an authenticated HTTPS tunnel. Never open port 9119 directly to the public internet.
3. The phone pairs with the Hermes backend; it receives a revocable, device-scoped credential held only in platform secure storage.
4. The mobile client opens authenticated TLS WebSocket/JSON-RPC transport to the paired backend. REST is for bootstrap/uploads only.
5. Hermes validates identity, device scope, profile permissions, and approval policy on every mutation. Sensitive tool actions remain subject to the desktop/backend approval model.

Tailscale is preferable for the first shipping path: no inbound router/firewall configuration, private DNS, encrypted peer-to-peer transport, and easy device revocation. A Cloudflare/Tailscale Funnel-style public tunnel is a later opt-in deployment, protected by Hermes authentication.

## Hermes mapping

- Bot roster = Hermes profiles / Bot Mode roster.
- Bot DM = canonical persistent Bot Chat.
- Groups = Hermes Bot Mode group rooms.
- `@mentions` = live roster resolution; the active Bot independently uses `message_agent`.
- Tool cards = sanitized activity/tool telemetry; never chain-of-thought.
- SOUL = profile `SOUL.md`.
- Model override = profile pin; null means inherit backend default.

## Current local development bridge

For the owner-machine Windows development flow, the Tauri shell reads the short-lived session credential injected by the local Hermes dashboard and sends it only to the loopback Hermes backend. It reads `/api/profiles/sessions` for the all-sessions projection and `/api/sessions/{id}/messages` for history; the Bots roster comes from `profiles.list` because only that RPC resolves canonical hidden Bot Chats correctly.

A single durable `/api/ws` newline-delimited JSON-RPC client now routes responses by request ID and pushed events by session. It waits for `gateway.ready`, uses `session.resume`, treats `prompt.submit` as acceptance rather than completion, waits for terminal turn events, and supports `session.interrupt`. This follows the proven Remote Gateway architecture merged through `rusty4444/hermes-android` issue #81; detailed portability findings are in `HERMES-ANDROID-PORTING.md`.

This is deliberately **not** remote-device auth. A phone cannot and must not fetch a desktop bootstrap credential. The phone setup must instead use Hermes’s authenticated pairing/password flow, mint a short-lived single-use `/api/auth/ws-ticket`, and keep its revocable credential in native secure storage.

## Bridge contract

The local adapter is real and its request/response shapes are verified against the running Hermes server and the desktop source. Keep the narrow `HermesBridge` interface as the seam for the upcoming paired remote adapter:

```ts
interface HermesBridge {
  connect(endpoint: string, pairingToken: string): Promise<void>
  getRoster(): Promise<Bot[]>
  getConversation(id: string): Promise<ChatMessage[]>
  sendMessage(conversationId: string, text: string): Promise<void>
  subscribe(listener: (event: HermesEvent) => void): () => void
}
```

Pairing is deliberately not faked as a network implementation. It must be implemented against Hermes’s authenticated server pairing APIs, not a mobile-invented bypass.

## Validation

`npm run test`, `npm run lint`, and `npm run build` validate the shared client. `cargo check` validates the Tauri desktop/mobile host. Android/iOS builds require the Android SDK or Xcode on their respective host OS.

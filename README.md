# Hermes Mobile App

A cross-platform remote control plane for a **running** Hermes Agent desktop/backend. The companion visual language is derived from the preserved `reference-ui/` screenshots: black canvas, white user surfaces, calm agent telemetry, Bot Mode roster, group rooms, mentions, voice notes, and bot setup.

## Run

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm tauri dev
```

Android (on a machine with Android SDK):

```bash
pnpm tauri android init
pnpm tauri android dev
```

iOS (on macOS with Xcode):

```bash
pnpm tauri ios init
pnpm tauri ios dev
```

## Current product increment

- **Live local mirror:** the Tauri shell calls the running Hermes backend at `http://127.0.0.1:9119`, uses its short-lived desktop session credential only in the native bridge, and renders actual profiles, all-profile session rows, transcripts, models, timestamps, and previews.
- **Live control path:** the composer resumes a real Hermes session over `/api/ws` JSON-RPC and submits `prompt.submit`; assistant deltas and completion events are streamed back to the client.
- Bot and Session tabs are intentionally separate: Bots are Hermes profiles with their latest real activity; Sessions is the current all-profile session list.
- The app does not start a model or agent runtime. `hermes serve` remains the host/execution authority.
- The next security increment is the paired remote-client login/ticket flow for a phone over Tailscale. The local bootstrap-token bridge is restricted to this owner-machine development path and must not become the remote authentication mechanism.

Read `ARCHITECTURE.md` before modifying the production bridge.

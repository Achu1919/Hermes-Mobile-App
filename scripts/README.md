# Hermes Mobile host gateway installers

Hermes Mobile is a secure client for an existing Hermes host. A phone must reach
an authenticated `hermes serve` gateway; it cannot use the host's loopback-only
Desktop backend directly.

These installers create a private gateway over **Tailscale only**. On Windows,
Hermes uses the runtime-compatible wildcard bind while Windows Firewall limits
TCP `9119` to the host's `100.64.0.0/10` Tailscale peers; on macOS, the
LaunchAgent binds directly to the local Tailscale address. Neither path opens
port 9119 to the public internet.

## Before starting

1. Install and sign in to [Tailscale](https://tailscale.com/download) on both
   the Hermes host and phone.
2. Install [Hermes Agent / Hermes Desktop](https://hermes-agent.nousresearch.com/)
   on the host and complete its initial setup.
3. Do not expose TCP `9119` to the public internet. Use Tailscale or a separately
   designed authenticated HTTPS/OAuth deployment instead.

The installer preserves an existing Hermes OAuth/basic-auth provider. If no
basic provider is found in the host `.env`, it prompts once for a username and
password and generates the stable signing secret required for sessions to survive
restarts. Passwords and secrets are never printed; the phone stores only revocable
native secure-storage tokens after pairing.

## Windows

Run `setup-hermes-tailscale-gateway.cmd` by right-clicking it and choosing
**Run as administrator**. It launches the portable PowerShell installer and
requests UAC elevation.

The installer:

- discovers `hermes.exe` from PATH or common Hermes homes;
- discovers the local Tailscale IP;
- supports explicit `-HermesExecutable`, `-HermesHome`, and `-TailscaleIP`
  overrides when discovery cannot find a nonstandard installation;
- starts one `hermes serve` listener on `0.0.0.0`, protected by a Windows Firewall rule restricted to `100.64.0.0/10`;
- writes a small per-user runner under the detected Hermes home;
- creates a per-user, login-start Scheduled Task with bounded restart attempts;
- verifies `http://<tailscale-ip>:9119/api/status`, requires `auth_required: true`, and fails status/install if the listener is duplicated, foreign, or not owned by `hermes serve`.

For advanced control, run from an elevated PowerShell prompt:

```powershell
.\scripts\install-hermes-mobile-gateway.ps1 -Mode Install
.\scripts\install-hermes-mobile-gateway.ps1 -Mode Status
.\scripts\install-hermes-mobile-gateway.ps1 -Mode Uninstall
```

If Hermes is not discovered, install Hermes first or provide the explicit path:

```powershell
.\scripts\install-hermes-mobile-gateway.ps1 `
  -HermesExecutable 'C:\path\to\hermes.exe' `
  -HermesHome 'C:\path\to\hermes'
```

`Uninstall` removes only the Hermes Mobile Scheduled Task, runner, and private
firewall rule. It intentionally preserves Hermes credentials and does not stop
unrelated Hermes servers.

## macOS

From the project directory:

```bash
chmod +x scripts/install-hermes-mobile-gateway.sh
./scripts/install-hermes-mobile-gateway.sh install
./scripts/install-hermes-mobile-gateway.sh status
./scripts/install-hermes-mobile-gateway.sh uninstall
```

The macOS installer:

- discovers `hermes` from PATH or common Hermes homes;
- discovers the Mac's Tailscale IP;
- binds Hermes directly to that private address rather than `0.0.0.0`;
- creates a per-user `launchd` LaunchAgent named `com.hermesmobile.gateway`;
- logs under `<HERMES_HOME>/logs/`;
- verifies the authenticated `/api/status` endpoint and rejects a broad, foreign, or non-Hermes listener on the gateway port.

No Windows-style firewall command is needed on macOS. Binding directly to the
Tailscale interface keeps the server off ordinary LAN/public interfaces. If
macOS displays an application-firewall prompt for Hermes, allow access only for
the trusted local Hermes executable.

For nonstandard installs:

```bash
./scripts/install-hermes-mobile-gateway.sh install \
  --hermes /path/to/hermes \
  --hermes-home /path/to/hermes-home \
  --tailscale-ip 100.x.y.z
```

`uninstall` removes only the LaunchAgent and leaves Hermes credentials intact.

## Pair the phone

After an installer succeeds, use the printed address in Hermes Mobile’s
**Settings → Security & Pairing** screen:

```text
http://<tailscale-ip>:9119
```

Test the gateway first, then sign in. A successful connection requires both
an authenticated REST response and authenticated Gateway WebSocket readiness.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::random;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    net::{IpAddr, TcpListener},
    thread,
    time::{Duration, Instant},
};
use tauri::AppHandle;
use tauri_plugin_keyring_store::KeyringExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;

const CONNECTION_STORE: &str = "hermes-mobile-connection.json";
const ENDPOINT_KEY: &str = "endpoint";

pub fn save_endpoint(app: &AppHandle, endpoint: &str) -> Result<(), String> {
    let store = app
        .store(CONNECTION_STORE)
        .map_err(|e| format!("Could not open mobile connection storage: {e}"))?;
    store.set(
        ENDPOINT_KEY,
        serde_json::Value::String(endpoint.to_string()),
    );
    store
        .save()
        .map_err(|e| format!("Could not save mobile connection: {e}"))
}

pub fn load_endpoint(app: &AppHandle) -> Result<Option<String>, String> {
    let store = app
        .store(CONNECTION_STORE)
        .map_err(|e| format!("Could not open saved mobile connection: {e}"))?;
    let Some(value) = store.get(ENDPOINT_KEY) else {
        return Ok(None);
    };
    let endpoint = value
        .as_str()
        .ok_or_else(|| "Saved mobile connection is invalid; pair this device again.".to_string())?
        .trim()
        .trim_end_matches('/');
    if !(endpoint.starts_with("http://") || endpoint.starts_with("https://")) {
        return Err("Saved mobile connection has an invalid gateway URL.".to_string());
    }
    Ok(Some(endpoint.to_string()))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub provider: String,
}

fn account(origin: &str) -> String {
    let digest = Sha256::digest(origin.as_bytes());
    format!(
        "hermes-mobile.gateway.{}",
        URL_SAFE_NO_PAD.encode(&digest[..12])
    )
}

pub fn load(app: &AppHandle, origin: &str) -> Result<Tokens, String> {
    let raw = app
        .keyring()
        .store
        .get_password(&account(origin))
        .map_err(|e| format!("Android secure credential store unavailable: {e}"))?
        .ok_or_else(|| {
            "This Hermes gateway needs sign-in. Tap Continue to secure sign-in.".to_string()
        })?;
    serde_json::from_str(&raw)
        .map_err(|_| "Saved gateway credential is invalid. Sign in again.".to_string())
}

fn persist_tokens_without_endpoint(
    app: &AppHandle,
    origin: &str,
    tokens: &Tokens,
) -> Result<(), String> {
    if tokens.access_token.is_empty() {
        return Err("Hermes returned no access token.".to_string());
    }
    app.keyring()
        .store
        .set_password(
            &account(origin),
            &serde_json::to_string(tokens).map_err(|e| e.to_string())?,
        )
        .map_err(|e| format!("Could not save Android secure credential: {e}"))
}

pub fn refresh(app: &AppHandle, origin: &str) -> Result<Tokens, String> {
    let current = load(app, origin)?;
    if current.refresh_token.is_empty() {
        return Err(
            "Hermes access expired and no refresh credential is available. Sign in again."
                .to_string(),
        );
    }
    let client = crate::http_client();
    let response = client
        .post(format!("{origin}/auth/native/refresh"))
        .json(&serde_json::json!({
            "refresh_token": current.refresh_token,
            "provider": current.provider,
        }))
        .send()
        .map_err(|e| format!("Could not refresh Hermes sign-in: {e}"))?;
    if !response.status().is_success() {
        return Err(response_error("Hermes session refresh failed", response));
    }
    let tokens: Tokens = response
        .json()
        .map_err(|_| "Hermes returned an invalid refreshed credential.".to_string())?;
    persist_tokens_without_endpoint(app, origin, &tokens)?;
    Ok(tokens)
}

pub fn ws_ticket(app: &AppHandle, origin: &str) -> Result<String, String> {
    let client = crate::http_client();
    let mut response = client
        .post(format!("{origin}/api/auth/ws-ticket"))
        .bearer_auth(load(app, origin)?.access_token)
        .send()
        .map_err(|e| format!("Could not mint Hermes WebSocket ticket: {e}"))?;
    if response.status().as_u16() == 401 {
        let refreshed = refresh(app, origin)?;
        response = client
            .post(format!("{origin}/api/auth/ws-ticket"))
            .bearer_auth(refreshed.access_token)
            .send()
            .map_err(|e| format!("Hermes WebSocket ticket retry failed: {e}"))?;
    }
    if !response.status().is_success() {
        return Err(response_error("Hermes rejected WebSocket ticket", response));
    }
    let ticket: serde_json::Value = response
        .json()
        .map_err(|_| "Hermes returned an invalid WebSocket ticket.".to_string())?;
    ticket
        .get("ticket")
        .and_then(|item| item.as_str())
        .map(str::to_string)
        .ok_or_else(|| "Hermes returned no WebSocket ticket.".to_string())
}

fn response_error(label: &str, response: reqwest::blocking::Response) -> String {
    let status = response.status();
    let body = response.text().unwrap_or_default();
    let detail = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .get("detail")
                .and_then(|item| item.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| status.to_string());
    format!("{label}: {detail}")
}

fn private_http_origin(origin: &str) -> bool {
    let Ok(parsed) = url::Url::parse(origin) else {
        return false;
    };
    if parsed.scheme() != "http" {
        return parsed.scheme() == "https";
    }
    let Some(host) = parsed.host_str() else {
        return false;
    };
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    let Ok(ip) = host.parse::<IpAddr>() else {
        return false;
    };
    match ip {
        IpAddr::V4(value) => {
            let octets = value.octets();
            octets[0] == 10
                || (octets[0] == 172 && (16..=31).contains(&octets[1]))
                || (octets[0] == 192 && octets[1] == 168)
                || (octets[0] == 100 && (64..=127).contains(&octets[1]))
                || value.is_loopback()
        }
        IpAddr::V6(value) => value.is_loopback() || value.is_unique_local(),
    }
}

/// Cookie name variants the gateway may mint (cookies.py resolves the prefix by request shape:
/// `__Host-` on plain HTTPS, `__Secure-` behind a proxy prefix, bare on HTTP).
const PKCE_COOKIE_VARIANTS: [&str; 3] = [
    "__Host-hermes_session_pkce",
    "__Secure-hermes_session_pkce",
    "hermes_session_pkce",
];

/// Parse one raw `Set-Cookie` header into a matching PKCE `(name, value)` pair, or `None`.
fn pkce_cookie_from_set_cookie(raw: &str) -> Option<(String, String)> {
    let pair = raw.split(';').next()?.trim();
    let (name, value) = pair.split_once('=')?;
    let name = name.trim();
    if !PKCE_COOKIE_VARIANTS.contains(&name) {
        return None;
    }
    Some((name.to_string(), value.trim().trim_matches('"').to_string()))
}

/// Collect the gateway's PKCE broker cookie from a response's `Set-Cookie` headers as a
/// ready-to-send `name=value` pair.
///
/// Why manual: reqwest's cookie store is browser-shaped and silently drops the
/// `__Host-`-prefixed `Secure` cookie the gateway sets on the `/auth/native/authorize` 302 hop
/// (auto-followed redirects also hide that hop's headers). Without it, `/auth/password-login`
/// cannot see the pending broker state and answers `{"next": "/"}` instead of the loopback
/// callback URL. We disable auto-redirect, read the cookie off the raw 302, and replay it as an
/// explicit `Cookie` header on the password-login request. This keeps the app working against
/// any stock Hermes gateway — no server-side fallbacks required.
fn capture_pkce_cookie(headers: &reqwest::header::HeaderMap) -> Option<String> {
    headers
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .find_map(|value| {
            value
                .to_str()
                .ok()
                .and_then(pkce_cookie_from_set_cookie)
                .map(|(name, val)| format!("{name}={val}"))
        })
}

pub fn password_sign_in_flow(
    origin: &str,
    username: &str,
    password: &str,
) -> Result<Tokens, String> {
    if username.trim().is_empty() || password.is_empty() {
        return Err("Enter the Hermes gateway username and password.".to_string());
    }
    let verifier = URL_SAFE_NO_PAD.encode(random::<[u8; 32]>());
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = URL_SAFE_NO_PAD.encode(random::<[u8; 24]>());
    // Hermes currently validates native redirects as RFC 8252 loopback URLs.
    // Mobile never navigates here: it reads the one-time code from the JSON
    // `next` value and redeems it directly while the app remains foreground.
    let redirect = "http://127.0.0.1:1/callback";
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        // The authorize hop's PKCE cookie is captured and replayed manually below; neither
        // auto-redirect header passthrough nor the cookie store can be trusted with it.
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Could not prepare secure sign-in: {e}"))?;
    let authorize = format!("{origin}/auth/native/authorize?provider=basic&code_challenge={challenge}&code_challenge_method=S256&redirect_uri={}&state={state}", urlencoding::encode(redirect));
    let authorization = client
        .get(authorize)
        .send()
        .map_err(|e| format!("Could not start Hermes password sign-in: {e}"))?;
    // The gateway answers 302 to /login (Policy::none keeps that hop's Set-Cookie visible);
    // accept any 2xx/3xx so alternate gateways that answer 200 also work.
    let authorize_status = authorization.status();
    if !(authorize_status.is_success() || authorize_status.is_redirection()) {
        return Err(response_error(
            "Hermes could not start secure sign-in",
            authorization,
        ));
    }
    let pkce_cookie = capture_pkce_cookie(authorization.headers()).ok_or_else(|| {
        "Hermes did not start a native sign-in session (no PKCE cookie on the authorize response). Is this URL a Hermes gateway with password sign-in?".to_string()
    })?;
    let login = client
        .post(format!("{origin}/auth/password-login"))
        .header(reqwest::header::COOKIE, pkce_cookie)
        .json(&serde_json::json!({
            "provider": "basic",
            "username": username,
            "password": password,
        }))
        .send()
        .map_err(|e| format!("Could not submit Hermes sign-in: {e}"))?;
    if !login.status().is_success() {
        return Err(response_error("Hermes sign-in failed", login));
    }
    let login_body: serde_json::Value = login
        .json()
        .map_err(|_| "Hermes returned an invalid password sign-in response.".to_string())?;
    let next = login_body
        .get("next")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Hermes password sign-in returned no authorization code.".to_string())?;
    let callback = url::Url::parse(next)
        .map_err(|_| "Hermes returned an invalid native authorization callback.".to_string())?;
    if !callback
        .query_pairs()
        .any(|(key, value)| key == "state" && value == state)
    {
        return Err("Secure sign-in state check failed.".to_string());
    }
    let code = callback
        .query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.into_owned())
        .ok_or_else(|| "Hermes password sign-in returned no authorization code.".to_string())?;
    let token_response = client
        .post(format!("{origin}/auth/native/token"))
        .json(&serde_json::json!({"code": code, "code_verifier": verifier}))
        .send()
        .map_err(|e| format!("Could not finish Hermes sign-in: {e}"))?;
    if !token_response.status().is_success() {
        return Err(response_error(
            "Hermes rejected secure sign-in",
            token_response,
        ));
    }
    token_response
        .json()
        .map_err(|_| "Hermes returned an invalid token response.".to_string())
}

pub fn password_sign_in(
    app: AppHandle,
    origin: String,
    username: String,
    password: String,
) -> Result<(), String> {
    if !private_http_origin(&origin) {
        return Err("Password sign-in requires HTTPS, Tailscale (100.64.0.0/10), or a private LAN IP. Do not send gateway credentials to public HTTP.".to_string());
    }
    let tokens = password_sign_in_flow(&origin, &username, &password)?;
    persist_tokens_without_endpoint(&app, &origin, &tokens)
}

pub fn sign_in(app: AppHandle, origin: String) -> Result<(), String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Could not start secure sign-in callback: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let verifier = URL_SAFE_NO_PAD.encode(random::<[u8; 32]>());
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = URL_SAFE_NO_PAD.encode(random::<[u8; 24]>());
    let redirect = format!("http://127.0.0.1:{port}/callback");
    let authorize = format!("{origin}/auth/native/authorize?code_challenge={challenge}&code_challenge_method=S256&redirect_uri={}&state={state}", urlencoding::encode(&redirect));
    app.opener()
        .open_url(&authorize, None::<&str>)
        .map_err(|e| format!("Could not open secure Hermes sign-in: {e}"))?;
    let deadline = Instant::now() + Duration::from_secs(180);
    let (callback, mut callback_stream) = loop {
        if Instant::now() >= deadline {
            return Err(
                "Secure sign-in timed out. Return to Hermes Mobile and try again.".to_string(),
            );
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let mut request = [0u8; 4096];
                let count = stream.read(&mut request).unwrap_or(0);
                let line = String::from_utf8_lossy(&request[..count])
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_string();
                let path = line.split_whitespace().nth(1).unwrap_or("");
                break (path.to_string(), stream);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(80))
            }
            Err(e) => return Err(format!("Secure sign-in callback failed: {e}")),
        }
    };
    let outcome = (|| -> Result<(), String> {
        let callback_url = url::Url::parse(&format!("http://127.0.0.1{callback}"))
            .map_err(|_| "Invalid sign-in callback".to_string())?;
        if !callback_url
            .query_pairs()
            .any(|(key, value)| key == "state" && value == state)
        {
            return Err("Secure sign-in state check failed.".to_string());
        }
        let code = callback_url
            .query_pairs()
            .find(|(k, _)| k == "code")
            .map(|(_, v)| v.into_owned())
            .ok_or_else(|| "Secure sign-in returned no authorization code.".to_string())?;
        let response = reqwest::blocking::Client::new()
            .post(format!("{origin}/auth/native/token"))
            .json(&serde_json::json!({"code":code,"code_verifier":verifier}))
            .send()
            .map_err(|e| format!("Could not finish Hermes sign-in: {e}"))?
            .error_for_status()
            .map_err(|e| format!("Hermes rejected secure sign-in: {e}"))?;
        let tokens: Tokens = response
            .json()
            .map_err(|_| "Hermes returned an invalid sign-in response.".to_string())?;
        if tokens.access_token.is_empty() {
            return Err("Hermes returned no access token.".to_string());
        }
        app.keyring()
            .store
            .set_password(
                &account(&origin),
                &serde_json::to_string(&tokens).map_err(|e| e.to_string())?,
            )
            .map_err(|e| format!("Could not save Android secure credential: {e}"))?;
        // This non-secret endpoint must cross the same native lifecycle boundary
        // as the credential; React may be recreated while Chrome is foreground.
        save_endpoint(&app, &origin)
    })();

    let page = if outcome.is_ok() {
        "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>Hermes Mobile sign-in saved</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a10;color:#f7f8ff;font:16px system-ui}.card{width:min(88vw,360px);padding:32px;border:1px solid #343350;border-radius:28px;background:#151621;text-align:center;box-shadow:0 24px 70px #0008}.mark{font-size:42px}.ok{color:#84e7a2;font-weight:700}p{color:#b8bdca;line-height:1.5}</style></head><body><main class=card><div class=mark>*</div><h1>Hermes Mobile</h1><p class=ok>Secure sign-in saved</p><p>Your encrypted credential and Hermes host are saved on this phone. Return to Hermes Mobile while it verifies Bots and live chat.</p></main></body></html>"
    } else {
        "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>Hermes Mobile sign-in needs attention</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a10;color:#f7f8ff;font:16px system-ui}.card{width:min(88vw,360px);padding:32px;border:1px solid #5b3540;border-radius:28px;background:#151621;text-align:center;box-shadow:0 24px 70px #0008}.bad{color:#ff9aa8;font-weight:700}p{color:#b8bdca;line-height:1.5}</style></head><body><main class=card><h1>Hermes Mobile</h1><p class=bad>Sign-in needs attention</p><p>Return to Hermes Mobile for the exact diagnostic and retry. Your password was not stored in the browser.</p></main></body></html>"
    };
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        page.len(),
        page
    );
    callback_stream
        .write_all(response.as_bytes())
        .map_err(|e| format!("Could not finish secure sign-in callback: {e}"))?;
    callback_stream.flush().ok();
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header_map(values: &[&str]) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        for value in values {
            headers.append(
                reqwest::header::SET_COOKIE,
                reqwest::header::HeaderValue::from_str(value).unwrap(),
            );
        }
        headers
    }

    #[test]
    fn parses_pkce_cookie_from_host_prefixed_header() {
        let (name, value) = pkce_cookie_from_set_cookie(
            "__Host-hermes_session_pkce=eyJicm9rZXIiOiJhYmMifQ; Path=/; Secure; HttpOnly; SameSite=None",
        )
        .expect("host-prefixed PKCE cookie should parse");
        assert_eq!(name, "__Host-hermes_session_pkce");
        assert_eq!(value, "eyJicm9rZXIiOiJhYmMifQ");
    }

    #[test]
    fn parses_bare_and_secure_prefixed_variants() {
        let (bare_name, _) = pkce_cookie_from_set_cookie(
            "hermes_session_pkce=abc123; Path=/; HttpOnly; SameSite=Lax",
        )
        .expect("bare PKCE cookie should parse");
        assert_eq!(bare_name, "hermes_session_pkce");
        let (secure_name, _) = pkce_cookie_from_set_cookie(
            "__Secure-hermes_session_pkce=def456; Path=/hermes; Secure; HttpOnly",
        )
        .expect("secure-prefixed PKCE cookie should parse");
        assert_eq!(secure_name, "__Secure-hermes_session_pkce");
    }

    #[test]
    fn strips_surrounding_quotes_from_cookie_value() {
        let (_, value) =
            pkce_cookie_from_set_cookie("__Host-hermes_session_pkce=\"quoted.value\"; Path=/")
                .expect("quoted cookie should parse");
        assert_eq!(value, "quoted.value");
    }

    #[test]
    fn ignores_other_cookies_and_malformed_headers() {
        assert!(pkce_cookie_from_set_cookie("other=1; Path=/").is_none());
        assert!(pkce_cookie_from_set_cookie("__Host-hermes_session_pkce_nope=1").is_none());
        assert!(pkce_cookie_from_set_cookie("nonsense").is_none());
        assert!(pkce_cookie_from_set_cookie("=value").is_none());
    }

    #[test]
    fn captures_pkce_pair_from_response_headers() {
        let headers = header_map(&[
            "__Host-hermes_session_pkce=brokerhandle; Path=/; Secure; HttpOnly; SameSite=None",
            "other=ignored; Path=/",
        ]);
        assert_eq!(
            capture_pkce_cookie(&headers).expect("capture should find the PKCE cookie"),
            "__Host-hermes_session_pkce=brokerhandle"
        );
    }

    #[test]
    fn capture_returns_none_without_pkce_cookie() {
        let headers = header_map(&["session=elsewhere; Path=/"]);
        assert!(capture_pkce_cookie(&headers).is_none());
    }

    #[test]
    fn flow_rejects_blank_credentials_before_any_network_use() {
        let error = password_sign_in_flow("https://gateway.example", "  ", "secret")
            .expect_err("blank username must fail fast");
        assert!(
            error.contains("Enter the Hermes gateway username and password."),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn flow_rejects_empty_password_before_any_network_use() {
        let error = password_sign_in_flow("https://gateway.example", "achu", "")
            .expect_err("empty password must fail fast");
        assert!(
            error.contains("Enter the Hermes gateway username and password."),
            "unexpected error: {error}"
        );
    }
}

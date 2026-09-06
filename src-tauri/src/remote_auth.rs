use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::random;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    net::TcpListener,
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

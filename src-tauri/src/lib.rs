mod remote_auth;

use std::time::Duration;
use tauri_plugin_opener::OpenerExt;

fn server_origin(base_url: &str) -> String {
    base_url.trim_end_matches('/').to_string()
}

fn session_token(client: &reqwest::blocking::Client, origin: &str) -> Result<String, String> {
    let html = client
        .get(format!("{origin}/"))
        .send()
        .map_err(|error| format!("Could not reach Hermes: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Hermes bootstrap failed: {error}"))?
        .text()
        .map_err(|error| format!("Could not read Hermes bootstrap: {error}"))?;
    let marker = "window.__HERMES_SESSION_TOKEN__=";
    let start = html
        .find(marker)
        .ok_or("Hermes did not provide a local session credential")?
        + marker.len();
    let end = html[start..]
        .find(';')
        .ok_or("Hermes session credential was incomplete")?
        + start;
    serde_json::from_str::<String>(&html[start..end])
        .map_err(|_| "Hermes session credential was invalid".to_string())
}

fn is_loopback(origin: &str) -> bool {
    origin.contains("127.0.0.1") || origin.contains("localhost") || origin.contains("[::1]")
}

fn authenticated_get(app: &tauri::AppHandle, origin: &str, path: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;
    let request = client.get(format!("{origin}{path}"));
    let request = if is_loopback(origin) {
        request.header("X-Hermes-Session-Token", session_token(&client, origin)?)
    } else {
        request.bearer_auth(remote_auth::load(app, origin)?.access_token)
    };
    request
        .send()
        .map_err(|error| format!("Hermes request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Hermes rejected the request: {error}"))?
        .text()
        .map_err(|error| format!("Could not read Hermes response: {error}"))
}

#[tauri::command]
fn hermes_native_sign_in(app: tauri::AppHandle, base_url: String) -> Result<(), String> {
    remote_auth::sign_in(app, server_origin(&base_url))
}

#[tauri::command]
fn hermes_connection_probe(base_url: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    if !(origin.starts_with("https://") || origin.starts_with("http://")) {
        return Err("Enter a full http:// or https:// Hermes gateway URL".to_string());
    }
    let response = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?
        .get(format!("{origin}/api/status"))
        .send()
        .map_err(|error| {
            format!(
                "Could not reach this Hermes gateway ({error}). The address is reachable only when Hermes is bound to the Tailscale/LAN interface—not just 127.0.0.1—and its port is allowed by the host firewall."
            )
        })?;
    let status = response.status();
    let body = response.text().unwrap_or_default();
    if !status.is_success() {
        let detail = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|value| {
                value
                    .get("detail")
                    .and_then(|detail| detail.as_str())
                    .map(str::to_string)
            })
            .unwrap_or_else(|| "No diagnostic was returned by the gateway.".to_string());
        return Err(format!(
            "Gateway returned HTTP {status}: {detail} Check the URL, Hermes host binding, and reverse-proxy/Tailscale configuration."
        ));
    }
    Ok(body)
}

#[tauri::command]
fn hermes_snapshot(app: tauri::AppHandle, base_url: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    // Sessions are a REST projection. Bot roster rows are intentionally NOT
    // read here: the Desktop contract's profiles.list RPC owns canonical
    // hidden Bot Chat identity, preview, ui_meta, and activity.
    let sessions = authenticated_get(&app, &origin, "/api/profiles/sessions?limit=100&offset=0&min_messages=1&archived=exclude&order=recent&profile=all")?;
    Ok(format!(r#"{{"sessions":{sessions}}}"#))
}

#[tauri::command]
fn hermes_model_options(
    app: tauri::AppHandle,
    base_url: String,
    profile: String,
) -> Result<String, String> {
    let origin = server_origin(&base_url);
    authenticated_get(
        &app,
        &origin,
        &format!(
            "/api/model/options?explicit_only=1&profile={}",
            urlencoding::encode(&profile)
        ),
    )
}

#[tauri::command]
fn hermes_session_messages(
    app: tauri::AppHandle,
    base_url: String,
    session_id: String,
    profile: String,
) -> Result<String, String> {
    let origin = server_origin(&base_url);
    authenticated_get(&app, &origin, &format!("/api/sessions/{session_id}/messages?profile={profile}&limit=120&order=latest&include_compacted=true"))
}

fn authenticated_post(origin: &str, path: &str, body: serde_json::Value) -> Result<String, String> {
    authenticated_post_with_timeout(origin, path, body, Duration::from_secs(120))
}

fn authenticated_post_with_timeout(
    origin: &str,
    path: &str,
    body: serde_json::Value,
    timeout: Duration,
) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|error| error.to_string())?;
    let token = session_token(&client, origin)?;
    client
        .post(format!("{origin}{path}"))
        .header("X-Hermes-Session-Token", token)
        .json(&body)
        .send()
        .map_err(|error| format!("Hermes request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Hermes rejected the request: {error}"))?
        .text()
        .map_err(|error| format!("Could not read Hermes response: {error}"))
}

#[tauri::command]
fn hermes_transcribe(
    base_url: String,
    profile: String,
    data_url: String,
    mime_type: String,
) -> Result<String, String> {
    let origin = server_origin(&base_url);
    authenticated_post(
        &origin,
        &format!("/api/audio/transcribe?profile={profile}"),
        serde_json::json!({ "data_url": data_url, "mime_type": mime_type }),
    )
}

#[tauri::command]
fn hermes_cron_runs(
    app: tauri::AppHandle,
    base_url: String,
    job_id: String,
    profile: String,
) -> Result<String, String> {
    let origin = server_origin(&base_url);
    let profile_query = if profile.trim().is_empty() {
        String::new()
    } else {
        format!("?profile={}", urlencoding::encode(&profile))
    };
    authenticated_get(
        &app,
        &origin,
        &format!(
            "/api/cron/jobs/{}/runs{}",
            urlencoding::encode(&job_id),
            profile_query
        ),
    )
}

#[tauri::command]
fn hermes_trigger_cron(
    base_url: String,
    job_id: String,
    profile: String,
) -> Result<String, String> {
    let origin = server_origin(&base_url);
    let profile_query = if profile.trim().is_empty() {
        String::new()
    } else {
        format!("?profile={}", urlencoding::encode(&profile))
    };
    // Desktop deliberately waits for completion here: returning only after the
    // persisted run result prevents the mobile client from presenting a false success.
    authenticated_post_with_timeout(
        &origin,
        &format!(
            "/api/cron/jobs/{}/trigger{}",
            urlencoding::encode(&job_id),
            profile_query
        ),
        serde_json::json!({}),
        Duration::from_secs(24 * 60 * 60),
    )
}

fn authenticated_put(origin: &str, path: &str, body: serde_json::Value) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?;
    let token = session_token(&client, origin)?;
    client
        .put(format!("{origin}{path}"))
        .header("X-Hermes-Session-Token", token)
        .json(&body)
        .send()
        .map_err(|error| format!("Hermes request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Hermes rejected the request: {error}"))?
        .text()
        .map_err(|error| format!("Could not read Hermes response: {error}"))
}

#[tauri::command]
fn hermes_update_cron_prompt(
    base_url: String,
    job_id: String,
    profile: String,
    prompt: String,
) -> Result<String, String> {
    let origin = server_origin(&base_url);
    let profile_query = if profile.trim().is_empty() {
        String::new()
    } else {
        format!("?profile={}", urlencoding::encode(&profile))
    };
    authenticated_put(
        &origin,
        &format!(
            "/api/cron/jobs/{}{}",
            urlencoding::encode(&job_id),
            profile_query
        ),
        serde_json::json!({ "updates": { "prompt": prompt } }),
    )
}

#[tauri::command]
fn hermes_cron_blueprints(app: tauri::AppHandle, base_url: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    authenticated_get(&app, &origin, "/api/cron/blueprints")
}

#[tauri::command]
fn hermes_cron_delivery_targets(app: tauri::AppHandle, base_url: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    authenticated_get(&app, &origin, "/api/cron/delivery-targets")
}

#[tauri::command]
fn hermes_create_cron(
    base_url: String,
    profile: String,
    body: serde_json::Value,
) -> Result<String, String> {
    let origin = server_origin(&base_url);
    let query = if profile.trim().is_empty() {
        String::new()
    } else {
        format!("?profile={}", urlencoding::encode(&profile))
    };
    authenticated_post(&origin, &format!("/api/cron/jobs{}", query), body)
}

#[tauri::command]
fn hermes_instantiate_cron_blueprint(
    base_url: String,
    profile: String,
    body: serde_json::Value,
) -> Result<String, String> {
    let origin = server_origin(&base_url);
    let query = if profile.trim().is_empty() {
        String::new()
    } else {
        format!("?profile={}", urlencoding::encode(&profile))
    };
    authenticated_post(
        &origin,
        &format!("/api/cron/blueprints/instantiate{}", query),
        body,
    )
}

#[tauri::command]
fn open_microphone_settings() -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:privacy-microphone"])
            .spawn()
            .map_err(|error| format!("Could not open Windows microphone settings: {error}"))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
            .spawn()
            .map_err(|error| format!("Could not open macOS microphone settings: {error}"))?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg("gnome-control-center sound")
            .spawn()
            .map_err(|error| format!("Could not open microphone settings: {error}"))?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("Open your operating system microphone privacy settings, allow Hermes Mobile, then tap the mic again.".to_string())
}

#[tauri::command]
fn hermes_ws_url(app: tauri::AppHandle, base_url: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?;
    let ws_origin = origin
        .replacen("https://", "wss://", 1)
        .replacen("http://", "ws://", 1);
    if is_loopback(&origin) {
        return Ok(format!(
            "{ws_origin}/api/ws?token={}",
            session_token(&client, &origin)?
        ));
    }
    let ticket: serde_json::Value = client
        .post(format!("{origin}/api/auth/ws-ticket"))
        .bearer_auth(remote_auth::load(&app, &origin)?.access_token)
        .send()
        .map_err(|e| format!("Could not mint Hermes WebSocket ticket: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Hermes rejected WebSocket ticket: {e}"))?
        .json()
        .map_err(|_| "Hermes returned an invalid WebSocket ticket.".to_string())?;
    let value = ticket
        .get("ticket")
        .and_then(|item| item.as_str())
        .ok_or_else(|| "Hermes returned no WebSocket ticket.".to_string())?;
    Ok(format!("{ws_origin}/api/ws?ticket={value}"))
}

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    const ALLOWED_PREFIXES: [&str; 5] = [
        "https://github.com/",
        "https://hermes-agent.nousresearch.com/",
        "https://discord.gg/",
        "https://v2.tauri.app/",
        "https://stestein.com/",
    ];
    if !ALLOWED_PREFIXES
        .iter()
        .any(|prefix| url.starts_with(prefix))
    {
        return Err("This link is not an approved Hermes Mobile destination".to_string());
    }
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|error| format!("Could not open the system browser: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_keyring_store::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_external_url,
            hermes_native_sign_in,
            hermes_connection_probe,
            hermes_snapshot,
            hermes_model_options,
            hermes_session_messages,
            hermes_transcribe,
            hermes_cron_runs,
            hermes_trigger_cron,
            hermes_update_cron_prompt,
            hermes_cron_blueprints,
            hermes_cron_delivery_targets,
            hermes_create_cron,
            hermes_instantiate_cron_blueprint,
            open_microphone_settings,
            hermes_ws_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hermes Mobile");
}

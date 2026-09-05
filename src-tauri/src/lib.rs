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

fn authenticated_get(origin: &str, path: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;
    let token = session_token(&client, origin)?;
    client
        .get(format!("{origin}{path}"))
        .header("X-Hermes-Session-Token", token)
        .send()
        .map_err(|error| format!("Hermes request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Hermes rejected the request: {error}"))?
        .text()
        .map_err(|error| format!("Could not read Hermes response: {error}"))
}

#[tauri::command]
fn hermes_connection_probe(base_url: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    if !(origin.starts_with("https://") || origin.starts_with("http://")) {
        return Err("Enter a full http:// or https:// Hermes gateway URL".to_string());
    }
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?
        .get(format!("{origin}/api/status"))
        .send()
        .map_err(|error| format!("Could not reach this Hermes gateway: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Hermes gateway health check failed: {error}"))?
        .text()
        .map_err(|error| format!("Could not read Hermes gateway health: {error}"))
}

#[tauri::command]
fn hermes_snapshot(base_url: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    // Sessions are a REST projection. Bot roster rows are intentionally NOT
    // read here: the Desktop contract's profiles.list RPC owns canonical
    // hidden Bot Chat identity, preview, ui_meta, and activity.
    let sessions = authenticated_get(&origin, "/api/profiles/sessions?limit=100&offset=0&min_messages=1&archived=exclude&order=recent&profile=all")?;
    Ok(format!(r#"{{"sessions":{sessions}}}"#))
}

#[tauri::command]
fn hermes_model_options(base_url: String, profile: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    authenticated_get(
        &origin,
        &format!(
            "/api/model/options?explicit_only=1&profile={}",
            urlencoding::encode(&profile)
        ),
    )
}

#[tauri::command]
fn hermes_session_messages(
    base_url: String,
    session_id: String,
    profile: String,
) -> Result<String, String> {
    let origin = server_origin(&base_url);
    authenticated_get(&origin, &format!("/api/sessions/{session_id}/messages?profile={profile}&limit=120&order=latest&include_compacted=true"))
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
fn hermes_cron_runs(base_url: String, job_id: String, profile: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    let profile_query = if profile.trim().is_empty() {
        String::new()
    } else {
        format!("?profile={}", urlencoding::encode(&profile))
    };
    authenticated_get(
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
fn hermes_cron_blueprints(base_url: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    authenticated_get(&origin, "/api/cron/blueprints")
}

#[tauri::command]
fn hermes_cron_delivery_targets(base_url: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    authenticated_get(&origin, "/api/cron/delivery-targets")
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
fn hermes_ws_url(base_url: String) -> Result<String, String> {
    let origin = server_origin(&base_url);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?;
    let token = session_token(&client, &origin)?;
    let ws_origin = origin
        .replacen("https://", "wss://", 1)
        .replacen("http://", "ws://", 1);
    Ok(format!("{ws_origin}/api/ws?token={token}"))
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_external_url,
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

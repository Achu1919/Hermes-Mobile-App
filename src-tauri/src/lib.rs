use std::time::Duration;

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
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            hermes_snapshot,
            hermes_model_options,
            hermes_session_messages,
            hermes_transcribe,
            hermes_ws_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hermes Mobile");
}

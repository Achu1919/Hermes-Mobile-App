//! End-to-end proof of the native password sign-in flow against a real Hermes gateway.
//!
//! Runs ONLY when credentials are provided via env vars — nothing here is stored in the repo:
//!
//! ```bash
//! HERMES_GATEWAY_URL=https://your-pc.tailnet.ts.net \
//! HERMES_GATEWAY_USER=achu \
//! HERMES_GATEWAY_PASSWORD=... \
//! cargo test --test live_gateway -- --ignored --nocapture
//! ```
//!
//! The test drives `password_sign_in_flow` (the exact production path used by the
//! `hermes_password_sign_in` Tauri command) through the stock gateway's
//! authorize → password-login → native/token round trip and asserts a usable bearer
//! credential comes back. It never prints the tokens.

#![cfg(test)]

use hermes_mobile_app_lib::remote_auth::password_sign_in_flow;

fn env_or_panic(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| {
        panic!(
            "live gateway test requires {name}; run with --ignored and the \
             HERMES_GATEWAY_URL / HERMES_GATEWAY_USER / HERMES_GATEWAY_PASSWORD env vars"
        )
    })
}

#[test]
#[ignore = "live-network test; run explicitly with gateway credentials in env"]
fn live_gateway_password_sign_in_returns_bearer_tokens() {
    let origin = env_or_panic("HERMES_GATEWAY_URL");
    let username = env_or_panic("HERMES_GATEWAY_USER");
    let password = env_or_panic("HERMES_GATEWAY_PASSWORD");

    let tokens = password_sign_in_flow(origin.trim(), username.trim(), &password)
        .expect("password sign-in against the live gateway should succeed");

    assert!(
        !tokens.access_token.is_empty(),
        "gateway returned an empty access token"
    );
    assert!(
        !tokens.refresh_token.is_empty(),
        "gateway returned an empty refresh token"
    );
    assert!(
        tokens.expires_at > 0,
        "gateway returned a non-positive token expiry"
    );
    println!(
        "LIVE GATEWAY OK: provider={} access_token_len={} refresh_token_len={} expires_at={}",
        tokens.provider,
        tokens.access_token.len(),
        tokens.refresh_token.len(),
        tokens.expires_at
    );
}

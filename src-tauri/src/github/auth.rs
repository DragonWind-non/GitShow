use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;

pub const KEYRING_SERVICE: &str = "gitshow";
pub const KEYRING_USER: &str = "github_token";
pub const DEFAULT_GITHUB_OAUTH_URL: &str = "https://github.com";

static MOCK_KEYRING: Mutex<Option<String>> = Mutex::new(None);

fn is_mock_keyring() -> bool {
    std::env::var("GITSHOW_MOCK_KEYRING").is_ok()
}

fn get_oauth_base_url() -> String {
    std::env::var("GITSHOW_GITHUB_OAUTH_URL")
        .unwrap_or_else(|_| DEFAULT_GITHUB_OAUTH_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Deserialize)]
struct OAuthErrorResponse {
    error: Option<String>,
    error_description: Option<String>,
}

pub async fn request_device_code(client_id: &str) -> Result<DeviceCodeResponse, String> {
    let base_url = get_oauth_base_url();
    let url = format!("{base_url}/login/device/code");

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "client_id": client_id,
        "scope": "repo,read:user"
    });

    let resp = client
        .post(&url)
        .header("Accept", "application/json")
        .header("User-Agent", "GitShow")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error requesting device code: {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read device code response: {e}"))?;

    if !status.is_success() {
        if let Ok(err_resp) = serde_json::from_str::<OAuthErrorResponse>(&text) {
            let msg = err_resp
                .error_description
                .or(err_resp.error)
                .unwrap_or_else(|| format!("HTTP error {status}"));
            return Err(msg);
        }
        return Err(format!("HTTP error {status}: {text}"));
    }

    if let Ok(err_resp) = serde_json::from_str::<OAuthErrorResponse>(&text) {
        if let Some(err) = err_resp.error {
            let msg = err_resp
                .error_description
                .unwrap_or(err);
            return Err(msg);
        }
    }

    serde_json::from_str::<DeviceCodeResponse>(&text)
        .map_err(|e| format!("Failed to parse device code response: {e} (body: {text})"))
}

pub async fn poll_for_access_token(
    client_id: &str,
    device_code: &str,
    interval: u64,
) -> Result<String, String> {
    let base_url = get_oauth_base_url();
    let url = format!("{base_url}/login/oauth/access_token");

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "client_id": client_id,
        "device_code": device_code,
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code"
    });

    let mut current_interval = interval;

    loop {
        let resp = client
            .post(&url)
            .header("Accept", "application/json")
            .header("User-Agent", "GitShow")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error polling for access token: {e}"))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read access token response: {e}"))?;

        if !status.is_success() {
            if let Ok(err_resp) = serde_json::from_str::<OAuthErrorResponse>(&text) {
                let msg = err_resp
                    .error_description
                    .or(err_resp.error)
                    .unwrap_or_else(|| format!("HTTP error {status}"));
                return Err(msg);
            }
            return Err(format!("HTTP error {status}: {text}"));
        }

        let val: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("Invalid JSON response: {e} (body: {text})"))?;

        if let Some(token) = val.get("access_token").and_then(|v| v.as_str()) {
            return Ok(token.to_string());
        }

        if let Some(error) = val.get("error").and_then(|v| v.as_str()) {
            match error {
                "authorization_pending" => {
                    let sleep_dur = if std::env::var("GITSHOW_TEST_FAST_POLL").is_ok() {
                        Duration::from_millis(10)
                    } else {
                        Duration::from_secs(current_interval)
                    };
                    tokio::time::sleep(sleep_dur).await;
                    continue;
                }
                "slow_down" => {
                    current_interval += 5;
                    let sleep_dur = if std::env::var("GITSHOW_TEST_FAST_POLL").is_ok() {
                        Duration::from_millis(10)
                    } else {
                        Duration::from_secs(current_interval)
                    };
                    tokio::time::sleep(sleep_dur).await;
                    continue;
                }
                "expired_token" => {
                    return Err("Device code expired".to_string());
                }
                "access_denied" => {
                    return Err("Access denied by user".to_string());
                }
                _ => {
                    let desc = val
                        .get("error_description")
                        .and_then(|v| v.as_str())
                        .unwrap_or(error);
                    return Err(desc.to_string());
                }
            }
        }

        return Err(format!("Unexpected response: {text}"));
    }
}

pub fn store_token(token: &str) -> Result<(), String> {
    if is_mock_keyring() {
        let mut lock = MOCK_KEYRING.lock().map_err(|e| e.to_string())?;
        *lock = Some(token.to_string());
        return Ok(());
    }

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Failed to create keyring entry: {e}"))?;
    entry
        .set_password(token)
        .map_err(|e| format!("Failed to store token in keyring: {e}"))
}

pub fn get_token() -> Result<Option<String>, String> {
    if is_mock_keyring() {
        let lock = MOCK_KEYRING.lock().map_err(|e| e.to_string())?;
        return Ok(lock.clone());
    }

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Failed to create keyring entry: {e}"))?;
    match entry.get_password() {
        Ok(pwd) => Ok(Some(pwd)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to get token from keyring: {e}")),
    }
}

pub fn remove_token() -> Result<(), String> {
    if is_mock_keyring() {
        let mut lock = MOCK_KEYRING.lock().map_err(|e| e.to_string())?;
        *lock = None;
        return Ok(());
    }

    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("Failed to create keyring entry: {e}"))?;
    match entry.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete token from keyring: {e}")),
    }
}

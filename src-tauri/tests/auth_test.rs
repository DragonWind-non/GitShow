use gitshow_lib::github::auth::{
    get_token, poll_for_access_token, remove_token, request_device_code, store_token,
    DeviceCodeResponse,
};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;

static SERIAL_TEST_LOCK: Mutex<()> = Mutex::const_new(());

#[tokio::test]
async fn test_mock_keyring_storage() {
    let _guard = SERIAL_TEST_LOCK.lock().await;
    std::env::set_var("GITSHOW_MOCK_KEYRING", "1");

    // Clear any previous token
    let _ = remove_token();

    // Verify empty state
    let token = get_token().expect("get_token failed");
    assert_eq!(token, None);

    // Store a token
    store_token("gho_mock_token_12345").expect("store_token failed");

    // Retrieve token
    let token = get_token().expect("get_token failed");
    assert_eq!(token, Some("gho_mock_token_12345".to_string()));

    // Remove token
    remove_token().expect("remove_token failed");

    // Verify empty again
    let token = get_token().expect("get_token failed");
    assert_eq!(token, None);

    // Removing non-existent token should succeed idempotently
    assert!(remove_token().is_ok());
}

// Helper to spawn a minimal mock HTTP server for testing OAuth endpoints
async fn spawn_mock_server<F>(handler: F) -> (String, tokio::task::JoinHandle<()>)
where
    F: Fn(String, String) -> (u16, String) + Send + Sync + 'static,
{
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("failed to bind mock server");
    let addr = listener.local_addr().expect("failed to get local addr");
    let base_url = format!("http://127.0.0.1:{}", addr.port());

    let handler = Arc::new(handler);
    let handle = tokio::spawn(async move {
        loop {
            let (mut socket, _) = match listener.accept().await {
                Ok(conn) => conn,
                Err(_) => break,
            };

            let handler = Arc::clone(&handler);
            tokio::spawn(async move {
                let mut buffer = [0u8; 4096];
                let mut total_read = 0;
                let mut header_end = None;

                while total_read < buffer.len() {
                    let n = match socket.read(&mut buffer[total_read..]).await {
                        Ok(0) => break,
                        Ok(n) => n,
                        Err(_) => return,
                    };
                    total_read += n;

                    if let Some(pos) = buffer[..total_read]
                        .windows(4)
                        .position(|w| w == b"\r\n\r\n")
                    {
                        header_end = Some(pos);
                        break;
                    }
                }

                if let Some(h_end) = header_end {
                    let req_str = String::from_utf8_lossy(&buffer[..h_end]);
                    let first_line = req_str.lines().next().unwrap_or("");
                    let parts: Vec<&str> = first_line.split_whitespace().collect();
                    let path = parts.get(1).copied().unwrap_or("/").to_string();

                    // Extract content-length if any to read body
                    let content_length: usize = req_str
                        .lines()
                        .find(|l| l.to_lowercase().starts_with("content-length:"))
                        .and_then(|l| l.split(':').nth(1))
                        .and_then(|val| val.trim().parse().ok())
                        .unwrap_or(0);

                    let body_start = h_end + 4;
                    let mut body_bytes = buffer[body_start..total_read].to_vec();
                    while body_bytes.len() < content_length {
                        let mut chunk = vec![0u8; content_length - body_bytes.len()];
                        match socket.read(&mut chunk).await {
                            Ok(0) => break,
                            Ok(n) => body_bytes.extend_from_slice(&chunk[..n]),
                            Err(_) => break,
                        }
                    }
                    let body = String::from_utf8_lossy(&body_bytes).to_string();

                    let (status_code, resp_body) = handler(path, body);
                    let reason = match status_code {
                        200 => "OK",
                        400 => "Bad Request",
                        404 => "Not Found",
                        _ => "Response",
                    };

                    let response = format!(
                        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        status_code,
                        reason,
                        resp_body.len(),
                        resp_body
                    );

                    let _ = socket.write_all(response.as_bytes()).await;
                }
            });
        }
    });

    (base_url, handle)
}

#[tokio::test]
async fn test_request_device_code_success() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let (base_url, server_handle) = spawn_mock_server(|path, body| {
        assert_eq!(path, "/login/device/code");
        assert!(body.contains("client_id"));
        (
            200,
            r#"{
                "device_code": "mock_device_code_123",
                "user_code": "WDJB-NJTJ",
                "verification_uri": "https://github.com/login/device",
                "expires_in": 899,
                "interval": 5
            }"#
            .to_string(),
        )
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_OAUTH_URL", &base_url);

    let res = request_device_code("test_client_id_123")
        .await
        .expect("request_device_code failed");

    assert_eq!(
        res,
        DeviceCodeResponse {
            device_code: "mock_device_code_123".to_string(),
            user_code: "WDJB-NJTJ".to_string(),
            verification_uri: "https://github.com/login/device".to_string(),
            expires_in: 899,
            interval: 5,
        }
    );

    server_handle.abort();
}

#[tokio::test]
async fn test_request_device_code_error() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    let (base_url, server_handle) = spawn_mock_server(|path, _| {
        assert_eq!(path, "/login/device/code");
        (
            400,
            r#"{"error": "bad_verification_code", "error_description": "Invalid client_id"}"#
                .to_string(),
        )
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_OAUTH_URL", &base_url);

    let res = request_device_code("invalid_client").await;
    assert!(res.is_err());
    let err = res.err().unwrap();
    assert!(err.contains("bad_verification_code") || err.contains("Invalid client_id"));

    server_handle.abort();
}

#[tokio::test]
async fn test_poll_for_access_token_success() {
    let _guard = SERIAL_TEST_LOCK.lock().await;
    std::env::set_var("GITSHOW_TEST_FAST_POLL", "1");

    let (base_url, server_handle) = spawn_mock_server(|path, body| {
        assert_eq!(path, "/login/oauth/access_token");
        assert!(body.contains("mock_dev_code"));
        (
            200,
            r#"{
                "access_token": "gho_test_token_success_abc",
                "token_type": "bearer",
                "scope": "repo,read:user"
            }"#
            .to_string(),
        )
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_OAUTH_URL", &base_url);

    let token = poll_for_access_token("client_123", "mock_dev_code", 1)
        .await
        .expect("poll_for_access_token failed");

    assert_eq!(token, "gho_test_token_success_abc");

    server_handle.abort();
}

#[tokio::test]
async fn test_poll_for_access_token_pending_then_success() {
    let _guard = SERIAL_TEST_LOCK.lock().await;
    std::env::set_var("GITSHOW_TEST_FAST_POLL", "1");

    let attempts = Arc::new(AtomicUsize::new(0));
    let attempts_clone = Arc::clone(&attempts);

    let (base_url, server_handle) = spawn_mock_server(move |path, _| {
        assert_eq!(path, "/login/oauth/access_token");
        let count = attempts_clone.fetch_add(1, Ordering::SeqCst);
        if count == 0 {
            (
                200,
                r#"{"error": "authorization_pending", "error_description": "Pending"}"#.to_string(),
            )
        } else {
            (
                200,
                r#"{"access_token": "gho_token_after_pending", "token_type": "bearer"}"#
                    .to_string(),
            )
        }
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_OAUTH_URL", &base_url);

    let token = poll_for_access_token("client_123", "dev_pending_123", 1)
        .await
        .expect("polling should succeed after pending");

    assert_eq!(token, "gho_token_after_pending");
    assert!(attempts.load(Ordering::SeqCst) >= 2);

    server_handle.abort();
}

#[tokio::test]
async fn test_poll_for_access_token_slow_down_then_success() {
    let _guard = SERIAL_TEST_LOCK.lock().await;
    std::env::set_var("GITSHOW_TEST_FAST_POLL", "1");

    let attempts = Arc::new(AtomicUsize::new(0));
    let attempts_clone = Arc::clone(&attempts);

    let (base_url, server_handle) = spawn_mock_server(move |path, _| {
        assert_eq!(path, "/login/oauth/access_token");
        let count = attempts_clone.fetch_add(1, Ordering::SeqCst);
        if count == 0 {
            (
                200,
                r#"{"error": "slow_down", "error_description": "Slow down"}"#.to_string(),
            )
        } else {
            (
                200,
                r#"{"access_token": "gho_token_after_slow_down", "token_type": "bearer"}"#
                    .to_string(),
            )
        }
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_OAUTH_URL", &base_url);

    let token = poll_for_access_token("client_123", "dev_slow_down_123", 1)
        .await
        .expect("polling should succeed after slow_down");

    assert_eq!(token, "gho_token_after_slow_down");
    assert!(attempts.load(Ordering::SeqCst) >= 2);

    server_handle.abort();
}

#[tokio::test]
async fn test_poll_for_access_token_expired() {
    let _guard = SERIAL_TEST_LOCK.lock().await;
    std::env::set_var("GITSHOW_TEST_FAST_POLL", "1");

    let (base_url, server_handle) = spawn_mock_server(|path, _| {
        assert_eq!(path, "/login/oauth/access_token");
        (
            200,
            r#"{"error": "expired_token", "error_description": "Device code expired"}"#
                .to_string(),
        )
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_OAUTH_URL", &base_url);

    let res = poll_for_access_token("client_123", "dev_expired", 1).await;
    assert!(res.is_err());
    assert_eq!(res.err().unwrap(), "Device code expired");

    server_handle.abort();
}

#[tokio::test]
async fn test_poll_for_access_token_access_denied() {
    let _guard = SERIAL_TEST_LOCK.lock().await;
    std::env::set_var("GITSHOW_TEST_FAST_POLL", "1");

    let (base_url, server_handle) = spawn_mock_server(|path, _| {
        assert_eq!(path, "/login/oauth/access_token");
        (
            200,
            r#"{"error": "access_denied", "error_description": "User denied access"}"#.to_string(),
        )
    })
    .await;

    std::env::set_var("GITSHOW_GITHUB_OAUTH_URL", &base_url);

    let res = poll_for_access_token("client_123", "dev_denied", 1).await;
    assert!(res.is_err());
    assert_eq!(res.err().unwrap(), "Access denied by user");

    server_handle.abort();
}

#[tokio::test]
async fn test_poll_for_access_token_network_failure() {
    let _guard = SERIAL_TEST_LOCK.lock().await;

    // Use a port where no server is running
    std::env::set_var("GITSHOW_GITHUB_OAUTH_URL", "http://127.0.0.1:1");

    let res = poll_for_access_token("client_123", "dev_code", 1).await;
    assert!(res.is_err());
}

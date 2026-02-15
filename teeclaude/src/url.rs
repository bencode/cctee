pub fn build_ws_url(server: &str, token: Option<&str>, path: &str) -> String {
    let base = server.trim_end_matches('/');

    let (ws_base, has_path) = if base.starts_with("http://") {
        (base.replacen("http://", "ws://", 1), false)
    } else if base.starts_with("https://") {
        (base.replacen("https://", "wss://", 1), false)
    } else if base.starts_with("ws://") || base.starts_with("wss://") {
        (base.to_string(), base.contains("/ws/"))
    } else {
        (format!("wss://{}", base), false)
    };

    let url = if has_path {
        ws_base
    } else {
        format!("{}{}", ws_base, path)
    };

    match token {
        Some(t) => format!("{}?token={}", url, t),
        None => url,
    }
}

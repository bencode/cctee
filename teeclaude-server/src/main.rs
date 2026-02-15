mod terminal;
mod chat;

use anyhow::Result;
use axum::{routing::{get, post}, Router};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub terminal: terminal::TerminalState,
    pub chat: chat::ChatState,
    pub public_host: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4111);

    let public_host = std::env::var("PUBLIC_HOST")
        .unwrap_or_else(|_| format!("http://localhost:{}", port));

    let state = AppState {
        terminal: Default::default(),
        chat: Default::default(),
        public_host,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // Terminal mode routes
        .route("/api/terminal/token", post(terminal::api::create_token))
        .route("/api/terminal/token/validate", post(terminal::api::validate_token))
        .route("/api/terminal/input", post(terminal::api::send_input))
        .route("/api/terminal/events", get(terminal::api::events))
        .route("/api/terminal/status", get(terminal::api::get_status))
        .route("/ws/wrapper", get(terminal::ws::handle_wrapper_ws))
        // Chat mode routes
        .route("/api/chat/token", post(chat::api::create_token))
        .route("/api/chat/token/validate", post(chat::api::validate_token))
        .route("/api/chat/input", post(chat::api::chat_input))
        .route("/api/chat/events", get(chat::api::events))
        .route("/api/chat/status", get(chat::api::get_status))
        .route("/ws/listener", get(chat::ws::handle_listener_ws))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    println!("teeclaude server listening on http://0.0.0.0:{}", port);

    axum::serve(listener, app).await?;
    Ok(())
}

mod api;
mod ws;

use anyhow::Result;
use axum::{routing::{get, post}, Router};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};

use api::{create_token, events, get_status, send_input, validate_token};
use ws::{handle_wrapper_ws, TokenState};

#[derive(Clone)]
pub struct AppState {
    /// Map of token -> TokenState for session isolation
    pub tokens: Arc<RwLock<HashMap<String, TokenState>>>,
    /// Public host URL for generating command hints
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
        tokens: Arc::new(RwLock::new(HashMap::new())),
        public_host,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/token", post(create_token))
        .route("/api/token/validate", post(validate_token))
        .route("/api/input", post(send_input))
        .route("/api/events", get(events))
        .route("/api/status", get(get_status))
        .route("/ws/wrapper", get(handle_wrapper_ws))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    println!("cctee server listening on http://0.0.0.0:{}", port);

    axum::serve(listener, app).await?;
    Ok(())
}

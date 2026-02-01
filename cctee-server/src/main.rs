mod ws;

use anyhow::Result;
use axum::{routing::get, Router};
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};

use cctee_common::Message;
use ws::{handle_ui_ws, handle_wrapper_ws, WrapperConnections};

#[derive(Clone)]
pub struct AppState {
    /// Broadcast channel for UI clients (receives all messages)
    pub ui_tx: broadcast::Sender<Message>,
    /// Map of session_id -> wrapper sender for routing input
    pub wrappers: WrapperConnections,
}

#[tokio::main]
async fn main() -> Result<()> {
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(4111);

    let (ui_tx, _) = broadcast::channel::<Message>(1000);
    let state = AppState {
        ui_tx,
        wrappers: Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/ws/ui", get(handle_ui_ws))
        .route("/ws/wrapper", get(handle_wrapper_ws))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    println!("cctee server listening on http://0.0.0.0:{}", port);

    axum::serve(listener, app).await?;
    Ok(())
}

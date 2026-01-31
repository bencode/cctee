use crate::types::{OutputEvent, SessionInfo};
use anyhow::Result;
use axum::{
    extract::State,
    response::sse::{Event, Sse},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use futures::stream::Stream;
use std::{collections::HashMap, convert::Infallible, sync::Arc, time::Duration};
use tokio::sync::{broadcast, RwLock};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::cors::{Any, CorsLayer};

type Sessions = Arc<RwLock<HashMap<String, SessionInfo>>>;

#[derive(Clone)]
struct AppState {
    sessions: Sessions,
    tx: broadcast::Sender<OutputEvent>,
}

pub async fn start(port: u16) -> Result<()> {
    let (tx, _) = broadcast::channel::<OutputEvent>(1000);
    let state = AppState {
        sessions: Arc::new(RwLock::new(HashMap::new())),
        tx,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/output", post(handle_output))
        .route("/api/sessions", get(handle_sessions))
        .route("/api/sse", get(handle_sse))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    println!("cctee server listening on http://0.0.0.0:{}", port);

    axum::serve(listener, app).await?;
    Ok(())
}

async fn handle_output(State(state): State<AppState>, Json(event): Json<OutputEvent>) {
    // Update session info
    {
        let mut sessions = state.sessions.write().await;
        sessions
            .entry(event.session_id.clone())
            .and_modify(|s| s.last_activity = Utc::now())
            .or_insert_with(|| SessionInfo {
                id: event.session_id.clone(),
                command: String::new(),
                started_at: event.timestamp,
                last_activity: event.timestamp,
            });
    }

    // Broadcast to SSE subscribers
    let _ = state.tx.send(event);
}

async fn handle_sessions(State(state): State<AppState>) -> Json<Vec<SessionInfo>> {
    let sessions = state.sessions.read().await;
    Json(sessions.values().cloned().collect())
}

async fn handle_sse(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.tx.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|result| {
        result.ok().map(|event| {
            Ok(Event::default()
                .event("output")
                .json_data(&event)
                .unwrap_or_else(|_| Event::default()))
        })
    });

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(30))
            .text("ping"),
    )
}

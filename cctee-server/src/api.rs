use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{
        sse::{Event, Sse},
        IntoResponse,
    },
    Json,
};
use chrono::{DateTime, Utc};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};

use cctee_common::{Message, Token, TokenResponse, TokenValidateRequest, TokenValidateResponse};

use crate::{ws::TokenQuery, AppState, TokenState};

#[derive(Serialize)]
pub struct TokenInfo {
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub sessions: usize,
    pub is_valid: bool,
}

#[derive(Serialize)]
pub struct StatusSummary {
    pub total_tokens: usize,
    pub valid_tokens: usize,
    pub total_sessions: usize,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub tokens: Vec<TokenInfo>,
    pub summary: StatusSummary,
}

/// POST /api/token - Create a new token
pub async fn create_token(State(state): State<AppState>) -> Json<TokenResponse> {
    let token = Token::generate();
    let token_value = token.value.clone();
    let expires_at = token.expires_at;

    let token_state = TokenState::new(token);
    state
        .tokens
        .write()
        .await
        .insert(token_value.clone(), token_state);

    let host = state.public_host.clone();
    let ws_url = format!("{}/ws/wrapper?token={}", host, token_value);
    let command_hint = format!("cctee --server={} --token={} claude", host, token_value);

    Json(TokenResponse {
        token: token_value,
        expires_at,
        ws_url,
        command_hint,
    })
}

/// POST /api/token/validate - Validate a token
pub async fn validate_token(
    State(state): State<AppState>,
    Json(req): Json<TokenValidateRequest>,
) -> (StatusCode, Json<TokenValidateResponse>) {
    let tokens = state.tokens.read().await;

    match tokens.get(&req.token) {
        Some(token_state) if token_state.token.is_valid() => (
            StatusCode::OK,
            Json(TokenValidateResponse {
                valid: true,
                expires_at: Some(token_state.token.expires_at),
            }),
        ),
        _ => (
            StatusCode::OK,
            Json(TokenValidateResponse {
                valid: false,
                expires_at: None,
            }),
        ),
    }
}

#[derive(Debug, Deserialize)]
pub struct InputRequest {
    pub token: String,
    pub session_id: String,
    pub content: String,
}

/// POST /api/input - Send input to a session
pub async fn send_input(
    State(state): State<AppState>,
    Json(req): Json<InputRequest>,
) -> impl IntoResponse {
    let tokens = state.tokens.read().await;

    let token_state = match tokens.get(&req.token) {
        Some(ts) if ts.token.is_valid() => ts,
        Some(_) => return StatusCode::UNAUTHORIZED,
        None => return StatusCode::UNAUTHORIZED,
    };

    let wrappers = token_state.wrappers.read().await;
    let tx = match wrappers.get(&req.session_id) {
        Some(tx) => tx.clone(),
        None => return StatusCode::NOT_FOUND,
    };
    drop(wrappers);
    drop(tokens);

    let message = Message::input(&req.session_id, &req.content);
    match tx.send(message).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

/// GET /api/events?token=xxx - SSE event stream
pub async fn events(
    Query(query): Query<TokenQuery>,
    State(state): State<AppState>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, StatusCode> {
    let tokens = state.tokens.read().await;

    let token_state = match tokens.get(&query.token) {
        Some(ts) if ts.token.is_valid() => ts,
        _ => return Err(StatusCode::UNAUTHORIZED),
    };

    let rx = token_state.ui_tx.subscribe();
    drop(tokens);

    let stream = BroadcastStream::new(rx).filter_map(|result| match result {
        Ok(msg) => match serde_json::to_string(&msg) {
            Ok(json) => Some(Ok(Event::default().data(json))),
            Err(_) => None,
        },
        Err(_) => None,
    });

    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("ping"),
    ))
}

/// GET /api/status - Get server status
pub async fn get_status(State(state): State<AppState>) -> Json<StatusResponse> {
    let tokens = state.tokens.read().await;

    let mut token_infos = Vec::new();
    let mut valid_tokens = 0;
    let mut total_sessions = 0;

    for (token_value, token_state) in tokens.iter() {
        let sessions = token_state.wrappers.read().await.len();
        let is_valid = token_state.token.is_valid();

        if is_valid {
            valid_tokens += 1;
        }
        total_sessions += sessions;

        token_infos.push(TokenInfo {
            token: token_value.clone(),
            expires_at: token_state.token.expires_at,
            sessions,
            is_valid,
        });
    }

    Json(StatusResponse {
        tokens: token_infos,
        summary: StatusSummary {
            total_tokens: tokens.len(),
            valid_tokens,
            total_sessions,
        },
    })
}

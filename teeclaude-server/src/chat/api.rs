use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{
        sse::{Event, Sse},
        IntoResponse,
    },
    Json,
};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};

use teeclaude_common::{ChatMessage, Token, TokenResponse, TokenValidateRequest, TokenValidateResponse};

use crate::AppState;
use super::ChatTokenState;
use super::ws::TokenQuery;

pub async fn create_token(State(state): State<AppState>) -> Json<TokenResponse> {
    let token = Token::generate();
    let token_value = token.value.clone();
    let expires_at = token.expires_at;

    let token_state = ChatTokenState::new(token);
    state
        .chat
        .tokens
        .write()
        .await
        .insert(token_value.clone(), token_state);

    let host = state.public_host.clone();
    let ws_url = format!("{}/ws/listener?token={}", host, token_value);
    let command_hint = format!("teeclaude --server={} --token={} start", host, token_value);

    Json(TokenResponse {
        token: token_value,
        expires_at,
        ws_url,
        command_hint,
    })
}

pub async fn validate_token(
    State(state): State<AppState>,
    Json(req): Json<TokenValidateRequest>,
) -> (StatusCode, Json<TokenValidateResponse>) {
    let tokens = state.chat.tokens.read().await;

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
pub struct ChatInputRequest {
    pub token: String,
    pub chat_session_id: Option<String>,
    pub app_root: String,
    pub content: String,
}

pub async fn chat_input(
    State(state): State<AppState>,
    Json(req): Json<ChatInputRequest>,
) -> impl IntoResponse {
    let tokens = state.chat.tokens.read().await;

    let token_state = match tokens.get(&req.token) {
        Some(ts) if ts.token.is_valid() => ts,
        _ => return StatusCode::UNAUTHORIZED,
    };

    let listener = token_state.listener.read().await;
    let sender = match listener.as_ref() {
        Some(conn) => conn.sender.clone(),
        None => return StatusCode::SERVICE_UNAVAILABLE,
    };
    drop(listener);
    drop(tokens);

    let message = ChatMessage::ChatInput {
        chat_session_id: req.chat_session_id,
        app_root: req.app_root,
        content: req.content,
    };

    match sender.send(message).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

#[derive(Debug, Deserialize)]
pub struct RefreshAppsRequest {
    pub token: String,
}

pub async fn refresh_apps(
    State(state): State<AppState>,
    Json(req): Json<RefreshAppsRequest>,
) -> impl IntoResponse {
    let tokens = state.chat.tokens.read().await;

    let token_state = match tokens.get(&req.token) {
        Some(ts) if ts.token.is_valid() => ts,
        _ => return StatusCode::UNAUTHORIZED,
    };

    let listener = token_state.listener.read().await;
    let sender = match listener.as_ref() {
        Some(conn) => conn.sender.clone(),
        None => return StatusCode::SERVICE_UNAVAILABLE,
    };
    drop(listener);
    drop(tokens);

    match sender.send(ChatMessage::ResyncApps).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

pub async fn events(
    Query(query): Query<TokenQuery>,
    State(state): State<AppState>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, StatusCode> {
    let tokens = state.chat.tokens.read().await;

    let token_state = match tokens.get(&query.token) {
        Some(ts) if ts.token.is_valid() => ts,
        _ => return Err(StatusCode::UNAUTHORIZED),
    };

    // Send current listener state as initial event
    let listener = token_state.listener.read().await;
    let initial_msg = listener.as_ref().map(|conn| ChatMessage::ListenerReady {
        apps: conn.apps.clone(),
    });
    drop(listener);

    let rx = token_state.tx.subscribe();
    drop(tokens);

    let initial_event = initial_msg.and_then(|msg| {
        serde_json::to_string(&msg)
            .ok()
            .map(|json| Ok(Event::default().data(json)))
    });

    let broadcast_stream = BroadcastStream::new(rx).filter_map(|result| match result {
        Ok(msg) => match serde_json::to_string(&msg) {
            Ok(json) => Some(Ok(Event::default().data(json))),
            Err(_) => None,
        },
        Err(_) => None,
    });

    let stream = futures::stream::iter(initial_event).chain(broadcast_stream);

    Ok(Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(15))
            .text("ping"),
    ))
}

#[derive(Serialize)]
pub struct ChatStatusResponse {
    pub listener_connected: bool,
    pub apps: Vec<String>,
}

pub async fn get_status(
    Query(query): Query<TokenQuery>,
    State(state): State<AppState>,
) -> Result<Json<ChatStatusResponse>, StatusCode> {
    let tokens = state.chat.tokens.read().await;

    let token_state = match tokens.get(&query.token) {
        Some(ts) if ts.token.is_valid() => ts,
        _ => return Err(StatusCode::UNAUTHORIZED),
    };

    let listener = token_state.listener.read().await;
    let (connected, apps) = match listener.as_ref() {
        Some(conn) => (true, conn.apps.iter().map(|a| a.root.clone()).collect()),
        None => (false, vec![]),
    };

    Ok(Json(ChatStatusResponse {
        listener_connected: connected,
        apps,
    }))
}

use axum::{
    extract::{
        ws::{Message as WsMessage, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;

use teeclaude_common::ChatMessage;

use crate::AppState;
use super::ListenerConnection;

#[derive(Debug, Deserialize)]
pub struct TokenQuery {
    pub token: String,
}

pub async fn handle_listener_ws(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    ws.on_upgrade(move |socket| handle_listener_socket(socket, state, query.token))
}

async fn handle_listener_socket(socket: WebSocket, state: AppState, token: String) {
    let tokens = state.chat.tokens.read().await;
    let token_state = match tokens.get(&token) {
        Some(ts) if ts.token.is_valid() => ts,
        _ => return,
    };

    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (listener_tx, mut listener_rx) = mpsc::channel::<ChatMessage>(100);
    let tx = token_state.tx.clone();

    // Wait for first message: ListenerReady
    let apps = loop {
        match ws_receiver.next().await {
            Some(Ok(WsMessage::Text(text))) => {
                if let Ok(ChatMessage::ListenerReady { apps }) =
                    serde_json::from_str::<ChatMessage>(&text)
                {
                    break apps;
                }
            }
            Some(Ok(WsMessage::Ping(_))) => continue,
            _ => return,
        }
    };

    // Register listener
    {
        let mut listener = token_state.listener.write().await;
        *listener = Some(ListenerConnection {
            sender: listener_tx,
            apps: apps.clone(),
        });
    }
    drop(tokens);

    // Broadcast ListenerReady to UI clients
    let _ = tx.send(ChatMessage::ListenerReady { apps });

    // Task: forward ChatInput messages to listener WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = listener_rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(_) => continue,
            };
            if ws_sender.send(WsMessage::Text(json)).await.is_err() {
                break;
            }
        }
    });

    // Task: receive messages from listener and broadcast to UI
    let tx_clone = tx.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            if let WsMessage::Text(text) = msg {
                if let Ok(message) = serde_json::from_str::<ChatMessage>(&text) {
                    let _ = tx_clone.send(message);
                }
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }

    // Cleanup: remove listener
    let tokens = state.chat.tokens.read().await;
    if let Some(ts) = tokens.get(&token) {
        let mut listener = ts.listener.write().await;
        *listener = None;
    }
}

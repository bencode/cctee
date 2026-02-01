use axum::{
    extract::{
        ws::{Message as WsMessage, WebSocket},
        State, WebSocketUpgrade,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{mpsc, RwLock};

use cctee_common::Message;

use crate::AppState;

pub type WrapperConnections = Arc<RwLock<HashMap<String, mpsc::Sender<Message>>>>;

/// Handle UI WebSocket connections
/// UI receives all messages and can send input to specific sessions
pub async fn handle_ui_ws(State(state): State<AppState>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(|socket| handle_ui_socket(socket, state))
}

async fn handle_ui_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.ui_tx.subscribe();

    // Task: forward broadcast messages to UI
    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(_) => continue,
            };
            if sender.send(WsMessage::Text(json.into())).await.is_err() {
                break;
            }
        }
    });

    // Task: receive input from UI and route to wrapper
    let wrappers = state.wrappers.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let WsMessage::Text(text) = msg {
                if let Ok(message) = serde_json::from_str::<Message>(&text) {
                    if let Message::Input { session_id, .. } = &message {
                        let wrappers = wrappers.read().await;
                        if let Some(tx) = wrappers.get(session_id) {
                            let _ = tx.send(message).await;
                        }
                    }
                }
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }
}

/// Handle Wrapper WebSocket connections
/// Wrapper sends output and receives input for its session
pub async fn handle_wrapper_ws(State(state): State<AppState>, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(|socket| handle_wrapper_socket(socket, state))
}

async fn handle_wrapper_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let (input_tx, mut input_rx) = mpsc::channel::<Message>(100);

    let mut session_id: Option<String> = None;

    // Task: forward input messages to wrapper
    let send_task = tokio::spawn(async move {
        while let Some(msg) = input_rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(_) => continue,
            };
            if sender.send(WsMessage::Text(json.into())).await.is_err() {
                break;
            }
        }
    });

    // Task: receive output from wrapper and broadcast to UI
    let ui_tx = state.ui_tx.clone();
    let wrappers = state.wrappers.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let WsMessage::Text(text) = msg {
                if let Ok(message) = serde_json::from_str::<Message>(&text) {
                    // Register wrapper on first message
                    if session_id.is_none() {
                        let id = message.session_id().to_string();
                        session_id = Some(id.clone());
                        wrappers.write().await.insert(id, input_tx.clone());
                    }

                    // Broadcast to all UI clients
                    let _ = ui_tx.send(message);
                }
            }
        }

        // Cleanup on disconnect
        if let Some(id) = session_id {
            wrappers.write().await.remove(&id);
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }
}

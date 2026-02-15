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

use teeclaude_common::TerminalMessage;

use crate::AppState;
use super::SessionConnection;

#[derive(Debug, Deserialize)]
pub struct TokenQuery {
    pub token: String,
}

pub async fn handle_wrapper_ws(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    ws.on_upgrade(move |socket| handle_wrapper_socket(socket, state, query.token))
}

async fn handle_wrapper_socket(socket: WebSocket, state: AppState, token: String) {
    let tokens = state.terminal.tokens.read().await;
    let token_state = match tokens.get(&token) {
        Some(ts) if ts.token.is_valid() => ts,
        _ => return,
    };

    let (mut sender, mut receiver) = socket.split();
    let (input_tx, mut input_rx) = mpsc::channel::<TerminalMessage>(100);

    let mut session_id: Option<String> = None;
    let ui_tx = token_state.ui_tx.clone();
    let wrappers = token_state.wrappers.clone();
    drop(tokens);

    let send_task = tokio::spawn(async move {
        while let Some(msg) = input_rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(_) => continue,
            };
            if sender.send(WsMessage::Text(json)).await.is_err() {
                break;
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let WsMessage::Text(text) = msg {
                if let Ok(message) = serde_json::from_str::<TerminalMessage>(&text) {
                    if session_id.is_none() {
                        let id = message.session_id().to_string();
                        let name = match &message {
                            TerminalMessage::SessionStart { name, .. } => name.clone(),
                            _ => None,
                        };
                        session_id = Some(id.clone());
                        wrappers.write().await.insert(
                            id,
                            SessionConnection {
                                sender: input_tx.clone(),
                                name,
                            },
                        );
                    }

                    let _ = ui_tx.send(message);
                }
            }
        }

        if let Some(id) = session_id {
            wrappers.write().await.remove(&id);
            let _ = ui_tx.send(TerminalMessage::session_end(&id));
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }
}

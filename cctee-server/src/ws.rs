use axum::{
    extract::{
        ws::{Message as WsMessage, WebSocket},
        Query, State, WebSocketUpgrade,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{broadcast, mpsc, RwLock};

use cctee_common::{Message, Token};

use crate::AppState;

pub struct SessionConnection {
    pub sender: mpsc::Sender<Message>,
    pub name: Option<String>,
}

pub type WrapperConnections = Arc<RwLock<HashMap<String, SessionConnection>>>;

/// Per-token state for session isolation
pub struct TokenState {
    pub token: Token,
    pub ui_tx: broadcast::Sender<Message>,
    pub wrappers: WrapperConnections,
}

impl TokenState {
    pub fn new(token: Token) -> Self {
        let (ui_tx, _) = broadcast::channel::<Message>(1000);
        Self {
            token,
            ui_tx,
            wrappers: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct TokenQuery {
    pub token: String,
}

/// Handle Wrapper WebSocket connections
/// Wrapper sends output and receives input for its session
pub async fn handle_wrapper_ws(
    State(state): State<AppState>,
    Query(query): Query<TokenQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    ws.on_upgrade(move |socket| handle_wrapper_socket(socket, state, query.token))
}

async fn handle_wrapper_socket(socket: WebSocket, state: AppState, token: String) {
    let tokens = state.tokens.read().await;
    let token_state = match tokens.get(&token) {
        Some(ts) if ts.token.is_valid() => ts,
        _ => return,
    };

    let (mut sender, mut receiver) = socket.split();
    let (input_tx, mut input_rx) = mpsc::channel::<Message>(100);

    let mut session_id: Option<String> = None;
    let ui_tx = token_state.ui_tx.clone();
    let wrappers = token_state.wrappers.clone();
    drop(tokens);

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
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let WsMessage::Text(text) = msg {
                if let Ok(message) = serde_json::from_str::<Message>(&text) {
                    // Register wrapper on first message (session_start)
                    if session_id.is_none() {
                        let id = message.session_id().to_string();
                        let name = match &message {
                            Message::SessionStart { name, .. } => name.clone(),
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

                    // Broadcast to all UI clients for this token
                    let _ = ui_tx.send(message);
                }
            }
        }

        // Cleanup on disconnect
        if let Some(id) = session_id {
            wrappers.write().await.remove(&id);
            let _ = ui_tx.send(Message::session_end(&id));
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }
}

use teeclaude_common::Message;
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

pub struct WsClient {
    /// Send output to server
    pub output_tx: mpsc::Sender<Message>,
    /// Receive input from server
    pub input_rx: mpsc::Receiver<Message>,
}

impl WsClient {
    /// Try to connect to server. Returns None if connection fails (non-blocking).
    pub async fn try_connect(server_url: &str, session_id: &str) -> Option<Self> {
        let (ws_stream, _) = connect_async(server_url).await.ok()?;
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        let (output_tx, mut output_rx) = mpsc::channel::<Message>(1000);
        let (input_tx, input_rx) = mpsc::channel::<Message>(100);

        let session_id = session_id.to_string();

        // Task: send output to server
        tokio::spawn(async move {
            while let Some(msg) = output_rx.recv().await {
                let json = match serde_json::to_string(&msg) {
                    Ok(j) => j,
                    Err(_) => continue,
                };
                if ws_sender.send(WsMessage::Text(json.into())).await.is_err() {
                    break;
                }
            }
        });

        // Task: receive input from server
        let session_id_clone = session_id.clone();
        tokio::spawn(async move {
            while let Some(Ok(msg)) = ws_receiver.next().await {
                if let WsMessage::Text(text) = msg {
                    if let Ok(message) = serde_json::from_str::<Message>(&text) {
                        if let Message::Input { session_id, .. } = &message {
                            if session_id == &session_id_clone {
                                if input_tx.send(message).await.is_err() {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        });

        Some(Self { output_tx, input_rx })
    }
}

/// Wrapper for optional WebSocket connection with fire-and-forget semantics
pub struct OptionalWs {
    tx: Option<mpsc::Sender<Message>>,
}

impl OptionalWs {
    pub fn new(client: Option<WsClient>) -> (Self, Option<mpsc::Receiver<Message>>) {
        match client {
            Some(c) => (Self { tx: Some(c.output_tx) }, Some(c.input_rx)),
            None => (Self { tx: None }, None),
        }
    }

    /// Send message to server. Silently ignores if not connected.
    pub fn send(&self, msg: Message) {
        if let Some(tx) = &self.tx {
            let _ = tx.try_send(msg);
        }
    }
}

/// Shared wrapper for thread-safe access
pub type SharedWs = Arc<OptionalWs>;

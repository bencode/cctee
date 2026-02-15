use teeclaude_common::TerminalMessage;
use futures::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

pub struct WsClient {
    pub output_tx: mpsc::Sender<TerminalMessage>,
    pub input_rx: mpsc::Receiver<TerminalMessage>,
}

impl WsClient {
    pub async fn try_connect(server_url: &str, session_id: &str) -> Option<Self> {
        let (ws_stream, _) = connect_async(server_url).await.ok()?;
        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        let (output_tx, mut output_rx) = mpsc::channel::<TerminalMessage>(1000);
        let (input_tx, input_rx) = mpsc::channel::<TerminalMessage>(100);

        let session_id = session_id.to_string();

        tokio::spawn(async move {
            while let Some(msg) = output_rx.recv().await {
                let json = match serde_json::to_string(&msg) {
                    Ok(j) => j,
                    Err(_) => continue,
                };
                if ws_sender.send(WsMessage::Text(json)).await.is_err() {
                    break;
                }
            }
        });

        let session_id_clone = session_id.clone();
        tokio::spawn(async move {
            while let Some(Ok(msg)) = ws_receiver.next().await {
                if let WsMessage::Text(text) = msg {
                    if let Ok(message) = serde_json::from_str::<TerminalMessage>(&text) {
                        if let TerminalMessage::Input { session_id, .. } = &message {
                            if session_id == &session_id_clone
                                && input_tx.send(message).await.is_err()
                            {
                                break;
                            }
                        }
                    }
                }
            }
        });

        Some(Self { output_tx, input_rx })
    }
}

pub struct OptionalWs {
    tx: Option<mpsc::Sender<TerminalMessage>>,
}

impl OptionalWs {
    pub fn new(client: Option<WsClient>) -> (Self, Option<mpsc::Receiver<TerminalMessage>>) {
        match client {
            Some(c) => (Self { tx: Some(c.output_tx) }, Some(c.input_rx)),
            None => (Self { tx: None }, None),
        }
    }

    pub fn send(&self, msg: TerminalMessage) {
        if let Some(tx) = &self.tx {
            let _ = tx.try_send(msg);
        }
    }
}

pub type SharedWs = Arc<OptionalWs>;

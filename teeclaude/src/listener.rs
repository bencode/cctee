use anyhow::Result;
use futures::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

use teeclaude_common::ChatMessage;

use crate::chat_handler;
use crate::config::Config;

pub async fn run(server_url: &str, root: Option<&str>) -> Result<()> {
    let app_root = match root {
        Some(r) => std::path::Path::new(r)
            .canonicalize()?
            .to_string_lossy()
            .to_string(),
        None => std::env::current_dir()?.to_string_lossy().to_string(),
    };

    chat_handler::ensure_claude_md(&app_root);

    let mut config = Config::load_or_create(&app_root)?;
    config.ensure_app(&app_root);
    config.save()?;

    let apps = config.to_app_infos();

    eprintln!("Connecting to {}...", server_url);
    let (ws_stream, _) = connect_async(server_url).await?;
    eprintln!("Connected. Waiting for chat messages...");

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    let ready_msg = ChatMessage::ListenerReady { apps };
    let json = serde_json::to_string(&ready_msg)?;
    ws_sender.send(WsMessage::Text(json)).await?;

    let (out_tx, mut out_rx) = mpsc::channel::<ChatMessage>(100);

    let send_task = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(_) => continue,
            };
            if ws_sender.send(WsMessage::Text(json)).await.is_err() {
                break;
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            let text = match msg {
                WsMessage::Text(t) => t,
                WsMessage::Ping(_) => continue,
                WsMessage::Close(_) => break,
                _ => continue,
            };

            let message = match serde_json::from_str::<ChatMessage>(&text) {
                Ok(m) => m,
                Err(_) => continue,
            };

            match message {
                ChatMessage::ChatInput {
                    chat_session_id,
                    app_root,
                    content,
                } => {
                    let out_tx = out_tx.clone();
                    let mut config = config.clone();
                    tokio::spawn(async move {
                        chat_handler::handle_chat_input(
                            &mut config,
                            &out_tx,
                            chat_session_id,
                            &app_root,
                            &content,
                        )
                        .await;
                    });
                }
                ChatMessage::ResyncApps => {
                    if let Ok(fresh) = Config::load_or_create(&app_root) {
                        let _ = out_tx
                            .send(ChatMessage::ListenerReady {
                                apps: fresh.to_app_infos(),
                            })
                            .await;
                    }
                }
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {
            eprintln!("Connection to server lost.");
        }
        _ = recv_task => {
            eprintln!("Connection to server lost.");
        }
        _ = tokio::signal::ctrl_c() => {
            eprintln!("Shutting down.");
        }
    }

    Ok(())
}

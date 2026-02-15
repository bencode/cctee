use anyhow::Result;
use futures::{SinkExt, StreamExt};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};

use teeclaude_common::{AppInfo, ChatMessage};

use crate::config::{ChatSession, Config};

pub async fn run(server_url: &str) -> Result<()> {
    let mut config = Config::load_or_create()?;

    let cwd = std::env::current_dir()?;
    let app_root = cwd.to_string_lossy().to_string();
    config.ensure_app(&app_root);
    config.save()?;

    let apps: Vec<AppInfo> = config
        .apps
        .iter()
        .map(|a| AppInfo {
            root: a.root.clone(),
            name: a
                .root
                .rsplit('/')
                .next()
                .unwrap_or(&a.root)
                .to_string(),
        })
        .collect();

    eprintln!("Connecting to {}...", server_url);
    let (ws_stream, _) = connect_async(server_url).await?;
    eprintln!("Connected. Waiting for chat messages...");

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    // Send ListenerReady
    let ready_msg = ChatMessage::ListenerReady { apps };
    let json = serde_json::to_string(&ready_msg)?;
    ws_sender.send(WsMessage::Text(json)).await?;

    // Channel for sending messages back to server
    let (out_tx, mut out_rx) = mpsc::channel::<ChatMessage>(100);

    // Task: forward outbound messages to WebSocket
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

    // Main loop: receive messages from server
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

            if let ChatMessage::ChatInput {
                chat_session_id,
                app_root,
                content,
            } = message
            {
                let out_tx = out_tx.clone();
                let mut config = config.clone();
                tokio::spawn(async move {
                    handle_chat_input(
                        &mut config,
                        &out_tx,
                        chat_session_id,
                        &app_root,
                        &content,
                    )
                    .await;
                });
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }

    Ok(())
}

async fn handle_chat_input(
    config: &mut Config,
    out_tx: &mpsc::Sender<ChatMessage>,
    chat_session_id: Option<String>,
    app_root: &str,
    content: &str,
) {
    // Determine session: resume existing or create new
    let (session_id, is_new) = match chat_session_id {
        Some(id) => (id, false),
        None => {
            let id = nanoid::nanoid!(8);
            (id, true)
        }
    };

    // Build claude command
    let mut cmd = tokio::process::Command::new("claude");
    cmd.arg("-p").arg(content);

    if !is_new {
        cmd.arg("-r").arg(&session_id);
    }

    cmd.current_dir(app_root);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let _ = out_tx
                .send(ChatMessage::chat_error(&session_id, e.to_string()))
                .await;
            return;
        }
    };

    // If new session, notify
    if is_new {
        let name = content.chars().take(50).collect::<String>();
        let session = ChatSession {
            id: session_id.clone(),
            name: name.clone(),
            created_at: chrono::Utc::now(),
            last_active: chrono::Utc::now(),
        };
        let _ = config.add_session(app_root, session);

        let _ = out_tx
            .send(ChatMessage::chat_session_created(
                &session_id,
                app_root,
                &name,
            ))
            .await;
    }

    // Stream stdout
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let _ = out_tx
                .send(ChatMessage::chat_output(&session_id, line + "\n"))
                .await;
        }
    }

    // Check exit status
    match child.wait().await {
        Ok(status) if status.success() => {
            let _ = config.update_session_activity(app_root, &session_id);
            let _ = out_tx.send(ChatMessage::chat_done(&session_id)).await;
        }
        Ok(status) => {
            let _ = out_tx
                .send(ChatMessage::chat_error(
                    &session_id,
                    format!("claude exited with status {}", status),
                ))
                .await;
        }
        Err(e) => {
            let _ = out_tx
                .send(ChatMessage::chat_error(&session_id, e.to_string()))
                .await;
        }
    }
}

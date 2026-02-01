use crate::ws_client::{OptionalWs, SharedWs, WsClient};
use anyhow::Result;
use cctee_common::Message;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{IsTerminal, Read, Write};
use std::os::unix::io::AsRawFd;
use std::sync::Arc;
use termios::{tcsetattr, Termios, TCSANOW};
use uuid::Uuid;

pub async fn run(command: &str, args: &[String], server_url: &str) -> Result<()> {
    let session_id = Uuid::new_v4().to_string();
    let pty_system = native_pty_system();

    let size = get_terminal_size();
    let pair = pty_system.openpty(size)?;

    let mut cmd = CommandBuilder::new(command);
    cmd.args(args);
    if let Ok(cwd) = std::env::current_dir() {
        cmd.cwd(cwd);
    }

    let mut child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);

    // Try to connect to server (non-blocking, failure is OK)
    let ws_client = WsClient::try_connect(server_url, &session_id).await;
    let (ws, input_rx) = OptionalWs::new(ws_client);
    let ws: SharedWs = Arc::new(ws);

    // Send session start
    let full_command = std::iter::once(command.to_string())
        .chain(args.iter().cloned())
        .collect::<Vec<_>>()
        .join(" ");
    ws.send(Message::session_start(&session_id, &full_command));

    // Set stdin to raw mode
    let stdin = std::io::stdin();
    let is_tty = stdin.is_terminal();
    let stdin_fd = stdin.as_raw_fd();
    let original_termios = if is_tty {
        Termios::from_fd(stdin_fd).ok().map(|orig| {
            let mut raw = orig;
            termios::cfmakeraw(&mut raw);
            let _ = tcsetattr(stdin_fd, TCSANOW, &raw);
            orig
        })
    } else {
        None
    };

    // Create channel for PTY writes (both local and remote input)
    let (pty_write_tx, mut pty_write_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(1000);

    // Setup stdin forwarding (local terminal → channel)
    let local_tx = pty_write_tx.clone();
    std::thread::spawn(move || {
        let mut stdin = std::io::stdin();
        let mut buf = [0u8; 1024];
        loop {
            match stdin.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if local_tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // Setup remote input forwarding (WebSocket → channel)
    if let Some(mut rx) = input_rx {
        let remote_tx = pty_write_tx.clone();
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let Message::Input { content, .. } = msg {
                    // Remove trailing newlines from content
                    let content = content.trim_end_matches(|c| c == '\n' || c == '\r');
                    // Send content
                    let _ = remote_tx.send(content.as_bytes().to_vec()).await;
                    // Small delay then send Enter (\r)
                    tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                    let _ = remote_tx.send(vec![b'\r']).await;
                }
            }
        });
    }

    // Single writer task for PTY
    let mut master_writer = pair.master.take_writer()?;
    tokio::spawn(async move {
        while let Some(data) = pty_write_rx.recv().await {
            if master_writer.write_all(&data).is_err() {
                break;
            }
            let _ = master_writer.flush();
        }
    });

    // Read PTY output
    let mut reader = pair.master.try_clone_reader()?;
    let mut buf = [0u8; 4096];
    let mut stdout = std::io::stdout();

    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let data = &buf[..n];

                // 1. Always output to local terminal
                let _ = stdout.write_all(data);
                let _ = stdout.flush();

                // 2. Send to server (fire-and-forget)
                let content = String::from_utf8_lossy(data).to_string();
                ws.send(Message::output(&session_id, content));
            }
            Err(_) => break,
        }
    }

    // Send session end
    ws.send(Message::session_end(&session_id));

    // Restore terminal
    if let Some(orig) = original_termios {
        let _ = tcsetattr(stdin_fd, TCSANOW, &orig);
    }

    let status = child.wait()?;
    std::process::exit(status.exit_code().try_into().unwrap_or(1));
}

fn get_terminal_size() -> PtySize {
    if let Some((cols, rows)) = term_size::dimensions() {
        PtySize {
            rows: rows as u16,
            cols: cols as u16,
            pixel_width: 0,
            pixel_height: 0,
        }
    } else {
        PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        }
    }
}

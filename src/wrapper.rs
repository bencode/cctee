use crate::sender;
use anyhow::Result;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{IsTerminal, Read, Write};
use std::os::unix::io::AsRawFd;
use termios::{tcsetattr, Termios, TCSANOW};
use tokio::sync::mpsc;
use uuid::Uuid;

pub async fn wrap(command: &str, args: &[String]) -> Result<()> {
    let session_id = Uuid::new_v4().to_string();
    let pty_system = native_pty_system();

    // Get terminal size
    let size = get_terminal_size();

    let pair = pty_system.openpty(size)?;

    // Build command
    let mut cmd = CommandBuilder::new(command);
    cmd.args(args);
    if let Ok(cwd) = std::env::current_dir() {
        cmd.cwd(cwd);
    }

    // Spawn child process
    let mut child = pair.slave.spawn_command(cmd)?;

    // Drop slave to avoid blocking
    drop(pair.slave);

    // Create channel (bounded, non-blocking)
    let (tx, rx) = mpsc::channel::<Vec<u8>>(1000);

    // Spawn background sender task
    tokio::spawn(sender::run(rx, session_id));

    // Set stdin to raw mode only if it's a terminal
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

    // Setup stdin forwarding
    let mut master_writer = pair.master.take_writer()?;
    std::thread::spawn(move || {
        let mut stdin = std::io::stdin();
        let mut buf = [0u8; 1024];
        loop {
            match stdin.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if master_writer.write_all(&buf[..n]).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
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

                // 1. Immediately output to stdout (don't wait for anything)
                let _ = stdout.write_all(data);
                let _ = stdout.flush();

                // 2. Send to channel (try_send doesn't block)
                let _ = tx.try_send(data.to_vec());
            }
            Err(_) => break,
        }
    }

    // Restore terminal settings
    if let Some(orig) = original_termios {
        let _ = tcsetattr(stdin_fd, TCSANOW, &orig);
    }

    // Wait for child to exit
    let status = child.wait()?;

    // Exit with same code as child
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

mod pty;
mod ws_client;

use anyhow::Result;
use clap::Parser;

#[derive(Parser)]
#[command(name = "cctee", about = "Claude Code session wrapper with remote viewing")]
struct Cli {
    /// Server URL for remote viewing
    #[arg(short, long, default_value = "wss://cctee.fmap.ai")]
    server: String,

    /// Authentication token for session isolation
    #[arg(short, long)]
    token: Option<String>,

    /// Session name for identification
    #[arg(short, long)]
    name: Option<String>,

    /// Command to wrap
    #[arg(trailing_var_arg = true, required = true)]
    args: Vec<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    if cli.args.is_empty() {
        eprintln!("Usage: cctee [--server URL] [--token TOKEN] <command> [args...]");
        std::process::exit(1);
    }

    let command = &cli.args[0];
    let args = &cli.args[1..];

    // Build WebSocket URL with token if provided
    let ws_url = build_ws_url(&cli.server, cli.token.as_deref());

    pty::run(command, args, &ws_url, cli.name.as_deref()).await
}

fn build_ws_url(server: &str, token: Option<&str>) -> String {
    let base = server.trim_end_matches('/');

    // Determine protocol
    let (ws_base, has_path) = if base.starts_with("http://") {
        (base.replacen("http://", "ws://", 1), false)
    } else if base.starts_with("https://") {
        (base.replacen("https://", "wss://", 1), false)
    } else if base.starts_with("ws://") || base.starts_with("wss://") {
        (base.to_string(), base.contains("/ws/"))
    } else {
        (format!("wss://{}", base), false)
    };

    // Add path if not present
    let url = if has_path {
        ws_base
    } else {
        format!("{}/ws/wrapper", ws_base)
    };

    // Add token query parameter
    match token {
        Some(t) => format!("{}?token={}", url, t),
        None => url,
    }
}

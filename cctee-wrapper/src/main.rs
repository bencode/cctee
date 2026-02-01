mod pty;
mod ws_client;

use anyhow::Result;
use clap::Parser;

#[derive(Parser)]
#[command(name = "cctee", about = "Claude Code session wrapper with remote viewing")]
struct Cli {
    /// Server URL for remote viewing
    #[arg(short, long, default_value = "ws://localhost:4111/ws/wrapper")]
    server: String,

    /// Command to wrap
    #[arg(trailing_var_arg = true, required = true)]
    args: Vec<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    if cli.args.is_empty() {
        eprintln!("Usage: cctee <command> [args...]");
        std::process::exit(1);
    }

    let command = &cli.args[0];
    let args = &cli.args[1..];

    pty::run(command, args, &cli.server).await
}

mod chat_handler;
mod config;
mod gateway;
mod listener;
mod pty;
mod url;
mod ws_client;

use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "teeclaude", about = "Claude Code session wrapper with remote viewing")]
struct Cli {
    /// Server URL for remote viewing
    #[arg(short, long, default_value = "wss://teeclaude.fmap.ai")]
    server: String,

    /// Authentication token for session isolation
    #[arg(short, long)]
    token: Option<String>,

    /// Session name for identification
    #[arg(short, long)]
    name: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Start chat listener mode
    Start {
        /// App root directory (defaults to current directory)
        #[arg(long)]
        root: Option<String>,
    },
    /// Manage background gateway daemon
    Gateway {
        #[command(subcommand)]
        action: GatewayAction,
    },
    /// Wrap a command (terminal mode)
    #[command(external_subcommand)]
    Wrap(Vec<String>),
}

#[derive(Subcommand)]
enum GatewayAction {
    /// Start the gateway daemon in background
    Start {
        /// App root directory (defaults to current directory)
        #[arg(long)]
        root: Option<String>,
    },
    /// Stop the running gateway daemon
    Stop,
    /// Show gateway daemon status
    Status,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Start { root } => {
            let ws_url = url::build_ws_url(&cli.server, cli.token.as_deref(), "/ws/listener");
            listener::run(&ws_url, root.as_deref()).await
        }
        Commands::Gateway { action } => match action {
            GatewayAction::Start { root } => {
                gateway::start(&cli.server, cli.token.as_deref(), root.as_deref())
            }
            GatewayAction::Stop => gateway::stop(cli.token.as_deref()),
            GatewayAction::Status => gateway::status(cli.token.as_deref()),
        },
        Commands::Wrap(args) => {
            if args.is_empty() {
                eprintln!("Usage: teeclaude [--server URL] [--token TOKEN] <command> [args...]");
                std::process::exit(1);
            }

            let command = &args[0];
            let cmd_args = &args[1..];

            let ws_url = url::build_ws_url(&cli.server, cli.token.as_deref(), "/ws/wrapper");

            let name = cli.name.or_else(|| {
                std::env::current_dir()
                    .ok()
                    .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
            });

            pty::run(command, cmd_args, &ws_url, name.as_deref()).await
        }
    }
}

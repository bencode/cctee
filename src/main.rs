mod sender;
mod server;
mod types;
mod wrapper;

use anyhow::Result;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "cctee", about = "Claude Code session aggregator")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Command to wrap (when no subcommand)
    #[arg(trailing_var_arg = true)]
    args: Vec<String>,
}

#[derive(Subcommand)]
enum Commands {
    /// Start aggregation server
    Server {
        #[arg(short, long, default_value = "4111")]
        port: u16,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Server { port }) => {
            server::start(port).await?;
        }
        None => {
            if cli.args.is_empty() {
                eprintln!("Usage: cctee <command> [args...]");
                eprintln!("       cctee server [--port <port>]");
                std::process::exit(1);
            }
            let command = &cli.args[0];
            let args = &cli.args[1..];
            wrapper::wrap(command, args).await?;
        }
    }

    Ok(())
}

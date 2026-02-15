pub mod api;
pub mod ws;

use std::{collections::HashMap, sync::Arc};
use tokio::sync::{broadcast, mpsc, RwLock};

use teeclaude_common::{TerminalMessage, Token};

pub struct SessionConnection {
    pub sender: mpsc::Sender<TerminalMessage>,
    pub name: Option<String>,
}

pub type WrapperConnections = Arc<RwLock<HashMap<String, SessionConnection>>>;

#[derive(Clone, Default)]
pub struct TerminalState {
    pub tokens: Arc<RwLock<HashMap<String, TerminalTokenState>>>,
}

pub struct TerminalTokenState {
    pub token: Token,
    pub ui_tx: broadcast::Sender<TerminalMessage>,
    pub wrappers: WrapperConnections,
}

impl TerminalTokenState {
    pub fn new(token: Token) -> Self {
        let (ui_tx, _) = broadcast::channel::<TerminalMessage>(1000);
        Self {
            token,
            ui_tx,
            wrappers: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

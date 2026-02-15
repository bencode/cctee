pub mod api;
pub mod ws;

use std::{collections::HashMap, sync::Arc};
use tokio::sync::{broadcast, mpsc, RwLock};

use teeclaude_common::{AppInfo, ChatMessage, Token};

#[derive(Clone, Default)]
pub struct ChatState {
    pub tokens: Arc<RwLock<HashMap<String, ChatTokenState>>>,
}

pub struct ChatTokenState {
    pub token: Token,
    /// Broadcast channel for UI subscribers (SSE)
    pub tx: broadcast::Sender<ChatMessage>,
    /// The connected listener (if any)
    pub listener: RwLock<Option<ListenerConnection>>,
}

impl ChatTokenState {
    pub fn new(token: Token) -> Self {
        let (tx, _) = broadcast::channel::<ChatMessage>(1000);
        Self {
            token,
            tx,
            listener: RwLock::new(None),
        }
    }
}

pub struct ListenerConnection {
    pub sender: mpsc::Sender<ChatMessage>,
    pub apps: Vec<AppInfo>,
}

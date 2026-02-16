use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub root: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSessionInfo {
    pub id: String,
    pub name: String,
    pub app_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ChatMessage {
    /// Listener → Server: listener is ready
    ListenerReady {
        apps: Vec<AppInfo>,
    },

    /// UI → Server → Listener: user sends a chat message
    ChatInput {
        chat_session_id: Option<String>,
        app_root: String,
        content: String,
    },

    /// Listener → Server → UI: streaming output from claude
    ChatOutput {
        chat_session_id: String,
        content: String,
        timestamp: DateTime<Utc>,
    },

    /// Listener → Server → UI: claude finished
    ChatDone {
        chat_session_id: String,
        timestamp: DateTime<Utc>,
    },

    /// Listener → Server → UI: claude error
    ChatError {
        chat_session_id: String,
        error: String,
        timestamp: DateTime<Utc>,
    },

    /// Listener → Server → UI: new chat session created
    ChatSessionCreated {
        chat_session_id: String,
        app_root: String,
        name: String,
        timestamp: DateTime<Utc>,
    },

    /// Server → Listener: request to reload config and resend apps
    ResyncApps,
}

impl ChatMessage {
    pub fn chat_output(chat_session_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self::ChatOutput {
            chat_session_id: chat_session_id.into(),
            content: content.into(),
            timestamp: Utc::now(),
        }
    }

    pub fn chat_done(chat_session_id: impl Into<String>) -> Self {
        Self::ChatDone {
            chat_session_id: chat_session_id.into(),
            timestamp: Utc::now(),
        }
    }

    pub fn chat_error(chat_session_id: impl Into<String>, error: impl Into<String>) -> Self {
        Self::ChatError {
            chat_session_id: chat_session_id.into(),
            error: error.into(),
            timestamp: Utc::now(),
        }
    }

    pub fn chat_session_created(
        chat_session_id: impl Into<String>,
        app_root: impl Into<String>,
        name: impl Into<String>,
    ) -> Self {
        Self::ChatSessionCreated {
            chat_session_id: chat_session_id.into(),
            app_root: app_root.into(),
            name: name.into(),
            timestamp: Utc::now(),
        }
    }
}

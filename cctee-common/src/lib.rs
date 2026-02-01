use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// WebSocket message types for communication between UI, Server, and Wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Message {
    /// Wrapper → Server → UI: PTY output
    Output {
        session_id: String,
        content: String,
        timestamp: DateTime<Utc>,
    },

    /// UI → Server → Wrapper: User input
    Input {
        session_id: String,
        content: String,
    },

    /// Wrapper → Server → UI: Session started
    SessionStart {
        session_id: String,
        command: String,
        timestamp: DateTime<Utc>,
    },

    /// Wrapper → Server → UI: Session ended
    SessionEnd {
        session_id: String,
        timestamp: DateTime<Utc>,
    },
}

impl Message {
    pub fn output(session_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self::Output {
            session_id: session_id.into(),
            content: content.into(),
            timestamp: Utc::now(),
        }
    }

    pub fn input(session_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self::Input {
            session_id: session_id.into(),
            content: content.into(),
        }
    }

    pub fn session_start(session_id: impl Into<String>, command: impl Into<String>) -> Self {
        Self::SessionStart {
            session_id: session_id.into(),
            command: command.into(),
            timestamp: Utc::now(),
        }
    }

    pub fn session_end(session_id: impl Into<String>) -> Self {
        Self::SessionEnd {
            session_id: session_id.into(),
            timestamp: Utc::now(),
        }
    }

    pub fn session_id(&self) -> &str {
        match self {
            Self::Output { session_id, .. } => session_id,
            Self::Input { session_id, .. } => session_id,
            Self::SessionStart { session_id, .. } => session_id,
            Self::SessionEnd { session_id, .. } => session_id,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub command: String,
    pub started_at: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
}

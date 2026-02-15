use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TerminalMessage {
    Output {
        session_id: String,
        content: String,
        timestamp: DateTime<Utc>,
    },
    Input {
        session_id: String,
        content: String,
    },
    SessionStart {
        session_id: String,
        command: String,
        name: Option<String>,
        timestamp: DateTime<Utc>,
    },
    SessionEnd {
        session_id: String,
        timestamp: DateTime<Utc>,
    },
    ActiveSessions {
        sessions: Vec<SessionBasicInfo>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionBasicInfo {
    pub id: String,
    pub name: Option<String>,
}

impl TerminalMessage {
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

    pub fn session_start(
        session_id: impl Into<String>,
        command: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        Self::SessionStart {
            session_id: session_id.into(),
            command: command.into(),
            name,
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
            Self::ActiveSessions { .. } => "",
        }
    }

    pub fn active_sessions(sessions: Vec<SessionBasicInfo>) -> Self {
        Self::ActiveSessions { sessions }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub command: String,
    pub name: Option<String>,
    pub started_at: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
}

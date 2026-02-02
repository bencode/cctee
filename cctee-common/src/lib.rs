use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Token for authentication and session isolation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub value: String,
    pub expires_at: DateTime<Utc>,
}

impl Token {
    /// Generate a new token with 8-char nanoid and 24h expiry
    pub fn generate() -> Self {
        Self {
            value: nanoid::nanoid!(8),
            expires_at: Utc::now() + chrono::Duration::hours(24),
        }
    }

    pub fn is_valid(&self) -> bool {
        Utc::now() < self.expires_at
    }
}

/// Response for token creation API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub ws_url: String,
    pub command_hint: String,
}

/// Request for token validation API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenValidateRequest {
    pub token: String,
}

/// Response for token validation API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenValidateResponse {
    pub valid: bool,
    pub expires_at: Option<DateTime<Utc>>,
}

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

    /// Server → UI: List of active sessions (sent on connect)
    ActiveSessions { session_ids: Vec<String> },
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
            Self::ActiveSessions { .. } => "",
        }
    }

    pub fn active_sessions(session_ids: Vec<String>) -> Self {
        Self::ActiveSessions { session_ids }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub command: String,
    pub started_at: DateTime<Utc>,
    pub last_activity: DateTime<Utc>,
}

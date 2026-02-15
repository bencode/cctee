use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Token {
    pub value: String,
    pub expires_at: DateTime<Utc>,
}

impl Token {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub ws_url: String,
    pub command_hint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenValidateRequest {
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenValidateResponse {
    pub valid: bool,
    pub expires_at: Option<DateTime<Utc>>,
}

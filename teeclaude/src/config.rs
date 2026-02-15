use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;

const CONFIG_FILE: &str = ".teeclaude.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub apps: Vec<App>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct App {
    pub root: String,
    pub sessions: Vec<ChatSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub last_active: DateTime<Utc>,
}

impl Config {
    pub fn load_or_create() -> Result<Self> {
        let path = Path::new(CONFIG_FILE);
        if path.exists() {
            let content = std::fs::read_to_string(path)?;
            Ok(serde_json::from_str(&content)?)
        } else {
            let config = Config { apps: vec![] };
            config.save()?;
            Ok(config)
        }
    }

    pub fn save(&self) -> Result<()> {
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(CONFIG_FILE, content)?;
        Ok(())
    }

    pub fn ensure_app(&mut self, root: &str) -> &mut App {
        if !self.apps.iter().any(|a| a.root == root) {
            self.apps.push(App {
                root: root.to_string(),
                sessions: vec![],
            });
        }
        self.apps.iter_mut().find(|a| a.root == root).unwrap()
    }

    pub fn add_session(&mut self, app_root: &str, session: ChatSession) -> Result<()> {
        let app = self.ensure_app(app_root);
        app.sessions.push(session);
        self.save()
    }

    pub fn update_session_activity(&mut self, app_root: &str, session_id: &str) -> Result<()> {
        if let Some(app) = self.apps.iter_mut().find(|a| a.root == app_root) {
            if let Some(session) = app.sessions.iter_mut().find(|s| s.id == session_id) {
                session.last_active = Utc::now();
                self.save()?;
            }
        }
        Ok(())
    }
}

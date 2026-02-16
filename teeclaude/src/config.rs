use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use teeclaude_common::AppInfo;

const CONFIG_FILE: &str = ".teeclaude.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(skip)]
    pub config_path: PathBuf,
    #[serde(default = "default_allowed_tools")]
    pub allowed_tools: Vec<String>,
    pub apps: Vec<App>,
}

fn default_allowed_tools() -> Vec<String> {
    [
        "Edit",
        "Write",
        "Bash(git *)",
        "Bash(npm *)",
        "Bash(npx *)",
        "Bash(node *)",
        "Bash(ls *)",
        "Bash(mkdir *)",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
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
    pub fn load_or_create(root: &str) -> Result<Self> {
        let config_path = Path::new(root).join(CONFIG_FILE);
        if config_path.exists() {
            let content = std::fs::read_to_string(&config_path)?;
            let mut config: Config = serde_json::from_str(&content)?;
            config.config_path = config_path;
            Ok(config)
        } else {
            let config = Config {
                config_path,
                allowed_tools: default_allowed_tools(),
                apps: vec![],
            };
            config.save()?;
            Ok(config)
        }
    }

    pub fn save(&self) -> Result<()> {
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&self.config_path, content)?;
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

    pub fn to_app_infos(&self) -> Vec<AppInfo> {
        self.apps
            .iter()
            .map(|a| AppInfo {
                root: a.root.clone(),
                name: a.root.rsplit('/').next().unwrap_or(&a.root).to_string(),
            })
            .collect()
    }
}

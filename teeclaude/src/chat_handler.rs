use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;

use teeclaude_common::ChatMessage;

use crate::config::{ChatSession, Config};

const CLAUDE_MD_TEMPLATE: &str = r#"# TeeClaude

## ui_call 协议

当你需要通知 UI 刷新时，在输出中使用 `<ui_call>` 标签：

```
<ui_call>["refresh_apps"]</ui_call>
```

支持的命令：
- `refresh_apps` — 重新加载 `.teeclaude.json` 并刷新 UI 的 app 列表

注意：`<ui_call>` 行不会显示在 UI 中，仅作为内部通信协议。

## /init-project skill

当用户想要初始化一个新项目时：

1. 引导用户提供 GitHub 仓库地址
2. 使用 `git clone <repo_url>` 将项目 clone 到当前 root 目录下
3. 编辑 `.teeclaude.json`，在 `apps` 数组中添加新 app 条目：
   ```json
   { "root": "<absolute_path_to_cloned_repo>", "sessions": [] }
   ```
4. 输出 `<ui_call>["refresh_apps"]</ui_call>` 通知 UI 刷新
"#;

pub fn ensure_claude_md(root: &str) {
    let path = std::path::Path::new(root).join("CLAUDE.md");
    if !path.exists() {
        let _ = std::fs::write(&path, CLAUDE_MD_TEMPLATE);
    }
}

fn check_result_event(line: &str) -> Option<bool> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    if v.get("type")?.as_str()? != "result" {
        return None;
    }
    v.get("is_error")?.as_bool()
}

pub async fn handle_chat_input(
    config: &mut Config,
    out_tx: &mpsc::Sender<ChatMessage>,
    chat_session_id: Option<String>,
    app_root: &str,
    content: &str,
) {
    let (session_id, is_new) = match chat_session_id {
        Some(id) => (id, false),
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            (id, true)
        }
    };

    let mut cmd = tokio::process::Command::new("claude");
    cmd.arg("-p").arg(content);
    cmd.arg("--output-format").arg("stream-json");
    cmd.arg("--verbose");

    if is_new {
        cmd.arg("--session-id").arg(&session_id);
    } else {
        cmd.arg("-r").arg(&session_id);
    }

    cmd.current_dir(app_root);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let _ = out_tx
                .send(ChatMessage::chat_error(&session_id, e.to_string()))
                .await;
            return;
        }
    };

    if is_new {
        let name = content.chars().take(50).collect::<String>();
        let session = ChatSession {
            id: session_id.clone(),
            name: name.clone(),
            created_at: chrono::Utc::now(),
            last_active: chrono::Utc::now(),
        };
        let _ = config.add_session(app_root, session);

        let _ = out_tx
            .send(ChatMessage::chat_session_created(
                &session_id,
                app_root,
                &name,
            ))
            .await;
    }

    // Stream stdout: forward raw stream-json lines to UI
    let mut got_result_error = false;

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(is_error) = check_result_event(&line) {
                got_result_error = is_error;
            }
            let _ = out_tx
                .send(ChatMessage::chat_output(&session_id, line))
                .await;
        }
    }

    match child.wait().await {
        Ok(status) if status.success() && !got_result_error => {
            let _ = config.update_session_activity(app_root, &session_id);
            let _ = out_tx.send(ChatMessage::chat_done(&session_id)).await;
        }
        Ok(status) => {
            let stderr_output = if let Some(stderr) = child.stderr.take() {
                let mut buf = String::new();
                let mut reader = BufReader::new(stderr);
                let _ = tokio::io::AsyncReadExt::read_to_string(&mut reader, &mut buf).await;
                buf
            } else {
                String::new()
            };
            let msg = if stderr_output.is_empty() {
                format!("claude exited with status {}", status)
            } else {
                format!(
                    "claude exited with status {}: {}",
                    status,
                    stderr_output.trim()
                )
            };
            let _ = out_tx
                .send(ChatMessage::chat_error(&session_id, msg))
                .await;
        }
        Err(e) => {
            let _ = out_tx
                .send(ChatMessage::chat_error(&session_id, e.to_string()))
                .await;
        }
    }
}

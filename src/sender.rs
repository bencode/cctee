use crate::types::OutputEvent;
use chrono::Utc;
use tokio::sync::mpsc;

pub async fn run(mut rx: mpsc::Receiver<Vec<u8>>, session_id: String) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    while let Some(data) = rx.recv().await {
        let event = OutputEvent {
            session_id: session_id.clone(),
            content: String::from_utf8_lossy(&data).to_string(),
            timestamp: Utc::now(),
        };

        // Fire-and-forget, don't wait for response
        let client = client.clone();
        tokio::spawn(async move {
            let _ = client
                .post("http://localhost:4111/api/output")
                .json(&event)
                .send()
                .await;
        });
    }
}

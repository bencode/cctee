use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use anyhow::{bail, Result};

pub fn start(server: &str, token: Option<&str>, root: Option<&str>) -> Result<()> {
    let id = gateway_id(token);
    let pid_file = pid_path(&id);
    let log_file = log_path(&id);

    if let Some(pid) = read_alive_pid(&pid_file) {
        bail!("Gateway already running (PID {pid}). Use `gateway stop` first.");
    }

    fs::create_dir_all(gateway_dir())?;

    let exe = std::env::current_exe()?;
    let mut cmd = Command::new(&exe);
    cmd.arg("--server").arg(server);
    if let Some(t) = token {
        cmd.arg("--token").arg(t);
    }
    cmd.arg("start");
    if let Some(r) = root {
        cmd.arg("--root").arg(r);
    }

    let log = fs::File::create(&log_file)?;
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(log);

    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }

    let child = cmd.spawn()?;
    let pid = child.id();
    fs::write(&pid_file, pid.to_string())?;

    eprintln!("Gateway started (PID {pid}).");
    eprintln!("Log: {}", log_file.display());
    Ok(())
}

pub fn stop(token: Option<&str>) -> Result<()> {
    let id = gateway_id(token);
    let pid_file = pid_path(&id);

    let pid = match read_alive_pid(&pid_file) {
        Some(p) => p,
        None => {
            eprintln!("Gateway is not running.");
            return Ok(());
        }
    };

    eprintln!("Stopping gateway (PID {pid})...");
    unsafe { libc::kill(pid as i32, libc::SIGTERM) };

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
    loop {
        if unsafe { libc::kill(pid as i32, 0) } != 0 {
            break;
        }
        if std::time::Instant::now() >= deadline {
            eprintln!("Process did not exit in time, sending SIGKILL.");
            unsafe { libc::kill(pid as i32, libc::SIGKILL) };
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    let _ = fs::remove_file(&pid_file);
    eprintln!("Gateway stopped.");
    Ok(())
}

pub fn status(token: Option<&str>) -> Result<()> {
    let id = gateway_id(token);
    let pid_file = pid_path(&id);
    let log_file = log_path(&id);

    match read_alive_pid(&pid_file) {
        Some(pid) => {
            eprintln!("Gateway is running (PID {pid}).");
            eprintln!("Log: {}", log_file.display());
        }
        None => {
            eprintln!("Gateway is not running.");
            if log_file.exists() {
                eprintln!("Log: {}", log_file.display());
            }
        }
    }
    Ok(())
}

fn gateway_dir() -> PathBuf {
    dirs_or_home().join(".teeclaude")
}

fn dirs_or_home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/tmp"))
}

fn gateway_id(token: Option<&str>) -> String {
    match token {
        Some(t) => {
            let mut h = DefaultHasher::new();
            t.hash(&mut h);
            format!("{:016x}", h.finish())
        }
        None => "default".to_string(),
    }
}

fn pid_path(id: &str) -> PathBuf {
    gateway_dir().join(format!("gateway-{id}.pid"))
}

fn log_path(id: &str) -> PathBuf {
    gateway_dir().join(format!("gateway-{id}.log"))
}

fn read_alive_pid(path: &std::path::Path) -> Option<u32> {
    let content = fs::read_to_string(path).ok()?;
    let pid: u32 = content.trim().parse().ok()?;
    let alive = unsafe { libc::kill(pid as i32, 0) } == 0;
    if alive {
        Some(pid)
    } else {
        let _ = fs::remove_file(path);
        None
    }
}

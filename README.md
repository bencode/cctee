# tee-claude

Remote Claude Code workspace with terminal monitoring and interactive chat.

## Features

- **Terminal mode** -- wrap any command and stream its I/O to a remote browser
- **Chat mode** -- interactive Claude chat in the browser, backed by a local Claude CLI
- **Real-time streaming** -- WebSocket + SSE for low-latency data relay
- **No server-side storage** -- session data lives only in the browser's IndexedDB
- **Multi-project support** -- manage multiple project roots in a single session
- **Token-based isolation** -- each token maps to an independent session with 24-hour expiry

## Architecture

```
Browser UI  <--SSE/REST-->  Server (Axum)  <--WebSocket-->  CLI (teeclaude)
```

Three layers:

1. **CLI** (`teeclaude`) -- Rust binary that either wraps a PTY (terminal mode) or runs the Claude CLI (chat mode), forwarding data to the server over WebSocket.
2. **Server** (`teeclaude-server`) -- Axum-based relay. Accepts WebSocket connections from the CLI and broadcasts events to the browser via SSE. Holds no persistent state.
3. **Browser UI** (`ui/`) -- React SPA with an xterm.js terminal emulator and a chat interface. Stores session data in IndexedDB.

## Install CLI

### Pre-built Binary (macOS Apple Silicon)

```bash
curl -fsSL https://raw.githubusercontent.com/bencode/tee-claude/main/install.sh | bash
```

### Build from Source

```bash
git clone https://github.com/bencode/tee-claude.git
cd tee-claude
cargo build --release
cp target/release/teeclaude /usr/local/bin/
```

## Usage

### Terminal Mode

Wrap a command to stream its terminal session to the browser:

```bash
teeclaude --token=<token> claude
```

Any command works -- `teeclaude` creates a PTY and relays input/output bidirectionally.

### Chat Mode

Start a chat listener that connects a local Claude CLI to the browser chat UI:

```bash
# Foreground (for development / debugging)
teeclaude --token=<token> start --root=<project-path>

# Background daemon
teeclaude --token=<token> start -d --root=<project-path>
```

The `--root` flag sets the working directory for Claude. The listener reads `.teeclaude.json` from the project root for session and tool configuration.

### Daemon Management

```bash
# Check daemon status
teeclaude --token=<token> status

# Stop the daemon
teeclaude --token=<token> stop
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--server` | Server WebSocket URL | `wss://teeclaude.fmap.ai` |
| `--token` | Authentication token | _(none)_ |
| `--name` | Session display name | _(none)_ |

## Deploy Server

Build and start with Docker Compose:

```bash
./build.sh
docker compose up -d
```

This starts three services:

- **server** -- Axum relay on port 4111
- **ui** -- builds the React SPA into static files
- **caddy** -- reverse proxy on port 4080, routes `/api/*` and `/ws/*` to the server, serves static files for everything else

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server listen port | `4111` |
| `PUBLIC_HOST` | Public base URL for clients | `http://localhost:{PORT}` |

## Configuration

`.teeclaude.json` is created automatically in the project root on first run. It tracks project roots, sessions, and tool permissions:

```json
{
  "apps": [
    {
      "root": "/path/to/project",
      "sessions": [
        {
          "id": "session-id",
          "name": "session name",
          "created_at": "2026-01-01T00:00:00Z",
          "last_active": "2026-01-01T00:00:00Z"
        }
      ]
    }
  ],
  "allowed_tools": [
    "Edit", "Write", "Bash(git *)", "Bash(npm *)"
  ]
}
```

## Privacy

- The server only relays messages in real-time and does not store any session content
- Session data is persisted exclusively in the client browser's local storage (IndexedDB)
- Data is automatically cleaned up when a session ends or the token expires

## License

MIT

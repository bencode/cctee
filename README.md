# tee-claude

Remote terminal session viewer for Claude Code.

## Install

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

```bash
teeclaude --server=wss://your-server.com --token=<token> claude
```

## Deploy Server

```bash
./build.sh
docker compose up -d
```

## Privacy

- The server only relays messages in real-time and does not store any session content
- Session data is persisted exclusively in the client browser's local storage (IndexedDB)
- Data is automatically cleaned up when a session ends or the token expires

## License

MIT

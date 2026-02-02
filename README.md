# cctee

Remote terminal session viewer for Claude Code.

## Install

### Pre-built Binary (macOS Apple Silicon)

```bash
curl -fsSL https://raw.githubusercontent.com/bencode/cctee/main/install.sh | bash
```

### Build from Source

```bash
git clone https://github.com/bencode/cctee.git
cd cctee
cargo build --release
cp target/release/cctee /usr/local/bin/
```

## Usage

```bash
cctee --server=wss://your-server.com --token=<token> claude
```

## Deploy Server

```bash
./build.sh
docker compose up -d
```

## License

MIT

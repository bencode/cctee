#!/bin/bash
set -e

REPO="bencode/cctee"
INSTALL_DIR="/usr/local/bin"

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)
    TARGET="x86_64-apple-darwin"
    ;;
  arm64|aarch64)
    TARGET="aarch64-apple-darwin"
    ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

# Get latest release tag
echo "Fetching latest release..."
LATEST=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST" ]; then
  echo "Failed to get latest release"
  exit 1
fi

echo "Latest version: $LATEST"

# Download
DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST/cctee-$TARGET.tar.gz"
echo "Downloading from $DOWNLOAD_URL..."

TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"
curl -sL "$DOWNLOAD_URL" -o cctee.tar.gz
tar -xzf cctee.tar.gz

# Install
echo "Installing to $INSTALL_DIR..."
if [ -w "$INSTALL_DIR" ]; then
  mv cctee "$INSTALL_DIR/"
else
  sudo mv cctee "$INSTALL_DIR/"
fi

# Cleanup
rm -rf "$TMP_DIR"

echo "cctee installed successfully!"
echo "Run 'cctee --help' to get started."

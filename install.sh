#!/bin/bash
set -e

REPO="bencode/tee-claude"
INSTALL_DIR="/usr/local/bin"

# Check architecture
ARCH=$(uname -m)
if [ "$ARCH" != "arm64" ] && [ "$ARCH" != "aarch64" ]; then
  echo "Error: Only Apple Silicon (arm64) is supported"
  echo "Your architecture: $ARCH"
  exit 1
fi

# Get latest release tag
echo "Fetching latest release..."
LATEST=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST" ]; then
  echo "Failed to get latest release"
  exit 1
fi

echo "Latest version: $LATEST"

# Download
DOWNLOAD_URL="https://github.com/$REPO/releases/download/$LATEST/teeclaude-aarch64-apple-darwin.tar.gz"
echo "Downloading from $DOWNLOAD_URL..."

TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"
curl -sL "$DOWNLOAD_URL" -o teeclaude.tar.gz
tar -xzf teeclaude.tar.gz

# Install
echo "Installing to $INSTALL_DIR..."
if [ -w "$INSTALL_DIR" ]; then
  mv teeclaude "$INSTALL_DIR/"
else
  sudo mv teeclaude "$INSTALL_DIR/"
fi

# Cleanup
rm -rf "$TMP_DIR"

echo "teeclaude installed successfully!"
echo "Run 'teeclaude --help' to get started."

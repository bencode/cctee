#!/bin/bash
set -e

echo "Building UI..."
mkdir -p ./data/static
docker compose build ui
docker compose run --rm ui

echo "Building server..."
docker compose build server

echo "Done! Run: docker compose up -d"

#!/bin/bash
# Start Holochain conductor for ad4m-web development
CONDUCTOR_BIN="${HOLOCHAIN_BIN:-holochain}"
CONFIG="${CONDUCTOR_CONFIG:-./conductor-config.yaml}"
DATA_DIR="./.holochain-data"

mkdir -p "$DATA_DIR"
echo "Starting Holochain conductor..."
exec "$CONDUCTOR_BIN" -c "$CONFIG"

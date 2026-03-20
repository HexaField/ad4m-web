# Holochain Conductor Setup for ad4m-web

## Prerequisites

- Rust toolchain (1.91.1+)
- The Coasys Holochain fork built from `0.7.0-dev.13-kitsune-0.4.0-dev3-coasys`

## Building the Conductor

```bash
cd ~/repos/hexafield
git clone --depth 1 --branch 0.7.0-dev.13-kitsune-0.4.0-dev3-coasys \
  https://github.com/coasys/holochain.git holochain-conductor
cd holochain-conductor
cargo build --release -p holochain --features "transport-iroh sqlite-encrypted"
```

The binary will be at `~/repos/hexafield/holochain-conductor/target/release/holochain`.

## Running the Conductor

From the `ad4m-web` root:

```bash
# Option 1: Use the startup script
HOLOCHAIN_BIN=~/repos/hexafield/holochain-conductor/target/release/holochain \
  ./scripts/start-conductor.sh

# Option 2: Run directly
~/repos/hexafield/holochain-conductor/target/release/holochain -c conductor-config.yaml
```

The conductor exposes a WebSocket admin interface on port **1234**.

## Configuration

Edit `conductor-config.yaml` to change:

- `admin_interfaces[0].driver.port` — WebSocket admin port (default: 1234)
- `environment_path` — data directory (default: `./.holochain-data`)
- `network.bootstrap_service` — bootstrap server URL

## Connecting ad4m-web

The `ws-conductor.ts` client connects to `ws://localhost:1234` for the admin interface. App interfaces are registered dynamically via the admin API.

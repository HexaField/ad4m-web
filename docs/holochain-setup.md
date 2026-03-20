# Holochain Conductor Setup for ad4m-web

## Prerequisites

- Rust toolchain (1.91.1+)
- The Coasys Holochain fork built from `0.7.0-dev.13-kitsune-0.4.0-dev3-coasys`

## Building the Conductor

```bash
git clone --depth 1 --branch 0.7.0-dev.13-kitsune-0.4.0-dev3-coasys \
  https://github.com/coasys/holochain.git holochain-conductor
cd holochain-conductor
cargo build --release -p holochain --features "transport-iroh sqlite-encrypted"
```

## Conductor Configuration

The conductor requires `lair_server_in_proc` keystore with a passphrase, and kitsune2 networking with bootstrap/signal/relay URLs.

Example `conductor-config.yaml`:

```yaml
environment_path: ./holochain-data
admin_interfaces:
  - driver:
      type: websocket
      port: 4322
      allowed_origins: '*'
keystore:
  type: lair_server_in_proc
  lair_root: ./holochain-data/ks
network:
  transport_pool:
    - type: webrtc
  bootstrap_url: https://dev-test-bootstrap2.holochain.org
  signal_url: wss://dev-test-bootstrap2.holochain.org
  relay_url: https://dev-test-bootstrap2.holochain.org
```

### Key Configuration Notes

- **`lair_server_in_proc`** is required (not `danger_test_keystore`) — test keystore causes "pub key not found" errors when signing agent info for kitsune2 network discovery.
- **Passphrase**: Start with `echo <passphrase> | holochain -c config.yaml --piped`
- **Network URLs**: Must use the official Holochain kitsune2 servers. The AD4M bootstrap (`bootstrap.ad4m.dev:4433`) is NOT kitsune2-compatible.
- **`relay_url`**: Must use `https://` scheme (plaintext rejected with `K2Error`).

## Running the Conductor

```bash
echo test-passphrase | /path/to/holochain -c conductor-config.yaml --piped
```

The conductor exposes a WebSocket admin interface on the configured port.

## Wire Protocol

### Admin Interface

Admin requests use msgpack-encoded messages:

```
{ type: 'request', id: <number>, data: encode({ type: '<admin_request_type>', value: {...} }) }
```

Admin request types use `serde(tag = "type", content = "value", rename_all = "snake_case")`.

### App Interface

1. **Authentication** (fire-and-forget, NOT request/response):

   ```
   ws.send(encode({ type: 'authenticate', data: encode({ token }) }))
   ```

2. **Zome calls** use pre-serialized params with separate signature:
   ```
   { type: 'call_zome', value: { bytes: encode(zomeCallParams), signature } }
   ```
   Where `zomeCallParams` contains `provenance`, `cell_id`, `zome_name`, `fn_name`, `payload`, `cap_secret`, `nonce`, `expires_at`.

### Capability Grants

Capabilities are granted via the **admin interface** (not zome calls):

```
{ type: 'grant_zome_call_capability', value: {
    cell_id: [dnaHash, agentPubKey],
    cap_grant: {
      tag: 'ad4m-web',
      access: { type: 'assigned', value: { secret: capSecret, assignees: [signerAgentPubKey] } },
      functions: { type: 'listed', value: [['zome_name', 'fn_name'], ...] }
    }
  }
}
```

### Signing

1. Generate a separate Ed25519 keypair for zome call signing
2. Wrap the public key as an `AgentPubKey` (prefix `[0x84, 0x20, 0x24]` + 32 bytes + 4-byte SHA-256 location)
3. Grant capability to this key via admin `grant_zome_call_capability`
4. For each zome call: `signature = Ed25519.sign(SHA-512(encode(params)), privateKey)`
5. `CapSecret` is 512 bits (64 bytes), NOT 32

## Interop with Reference AD4M

ad4m-web conductors can join neighbourhoods created by the reference AD4M executor. Requirements:

1. **Same Holochain version**: Must use the Coasys fork (`0.7.0-dev.14`)
2. **Same DNA**: Extract hApp bytes from the language bundle source (base64-encoded `var happ = "..."`)
3. **Same network seed**: From the language's template params `uid` field
4. **Same bootstrap/signal servers**: Both must use matching kitsune2 infrastructure

### Verified Working

- DNA installation with language-bundle-extracted hApp ✅
- Signed zome calls with admin-granted capabilities ✅
- `create_did_pub_key_link`, `sync`, `commit`, `render` ✅
- DHT peer discovery (Mac sees reference agent via `get_others`) ✅
- Cross-machine data propagation: asymmetric — needs longer gossip time or network tuning

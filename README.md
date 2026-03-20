# ad4m-web

A complete [AD4M](https://ad4m.dev) executor that runs entirely in the browser. No Electron, no Deno, no native dependencies. Pure TypeScript from the ground up — the only external requirement is a Holochain conductor for peer-to-peer networking.

## Why

AD4M's reference executor requires Rust, Deno, and Electron. This project makes AD4M accessible from any modern browser tab, with no installation beyond opening a URL.

## Architecture

```
┌─────────────────────────────────────┐
│           Browser Tab               │
│  ┌───────────┐  ┌────────────────┐  │
│  │  @ad4m-web │  │   @ad4m-web    │  │
│  │   /core    │  │    /client     │  │
│  │ (pure TS)  │  │ (browser APIs) │  │
│  └─────┬──────┘  └───────┬────────┘  │
│        └────────┬────────┘           │
│            GraphQL Engine            │
└────────────────┬────────────────────┘
                 │ WebSocket
    ┌────────────▼────────────┐
    │   Holochain Conductor   │
    │   (external process)    │
    └─────────────────────────┘
```

- **Core** — Platform-agnostic: agent crypto, link store, SHACL engine, perspectives, GraphQL, sync engine. Zero browser dependencies.
- **Client** — Browser bindings: IndexedDB persistence, Web Worker language isolation, Oxigraph WASM triple store, cross-tab leader election, Holochain WebSocket bridge.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full deep dive.

## Quick Start

```bash
pnpm install
pnpm build
pnpm dev          # starts client dev server + API server
```

Open `https://localhost:3000`. For Holochain p2p, see [docs/holochain-setup.md](./docs/holochain-setup.md).

## Test

```bash
pnpm test         # 285 tests (251 core + 34 client)
```

## Status

- ✅ Agent key management (Ed25519, DID:key)
- ✅ Perspectives & link CRUD with SPARQL queries
- ✅ SHACL subject classes
- ✅ Language runtime with Web Worker sandboxing
- ✅ GraphQL engine (queries, mutations, subscriptions)
- ✅ Cross-tab leader election
- ✅ IndexedDB persistence with auto-save
- ✅ Holochain conductor bridge (WebSocket, msgpack wire protocol)
- 🧪 Neighbourhood sync (p-diff-sync protocol)
- 🧪 Capability-based auth

## License

MIT — see [LICENSE](./LICENSE).

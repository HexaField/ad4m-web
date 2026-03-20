# ad4m-web

A complete [AD4M](https://ad4m.dev) executor in pure TypeScript. No Electron, no Deno, no native dependencies. Runs in the browser or on Node.js — the only external requirement is a Holochain conductor for peer-to-peer networking.

**392 tests · ~7,500 LOC production · ~5,900 LOC tests · 3 packages**

## Architecture

```
┌─────────────────────────────────────────┐
│            Browser / Node.js            │
│  ┌────────────┐ ┌───────┐ ┌──────────┐ │
│  │ @ad4m-web  │ │  ...  │ │ @ad4m-web│ │
│  │   /core    │ │/client│ │  /server │ │
│  │ (pure TS)  │ │(browser)│ │ (Node) │ │
│  └─────┬──────┘ └───┬───┘ └────┬─────┘ │
│        └──────┬──────┘──────────┘       │
│           GraphQL Engine                │
└──────────────────┬──────────────────────┘
                   │ WebSocket
      ┌────────────▼────────────┐
      │   Holochain Conductor   │
      └─────────────────────────┘
```

| Package | Description |
| --- | --- |
| **`@ad4m-web/core`** | Platform-agnostic executor: agent crypto, perspectives, links, SHACL, GraphQL schema, sync engine, capability auth, language runtime, expression system, neighbourhood management. Zero browser/Node dependencies. |
| **`@ad4m-web/client`** | Browser bindings: IndexedDB persistence, Web Worker language isolation, Oxigraph WASM triple store, cross-tab leader election, Holochain WebSocket bridge. |
| **`@ad4m-web/server`** | Node.js bindings: HTTP/WebSocket GraphQL transport, file-system persistence. |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full deep dive.

## Quick Start

```bash
pnpm install
pnpm build
pnpm dev          # starts client dev server + API server
```

Open `https://localhost:3000`. For Holochain p2p, see [docs/holochain-setup.md](./docs/holochain-setup.md).

## Tests

```bash
pnpm test         # 392 tests (361 core + 30 client + 1 server)
```

## Implemented Features

- ✅ Agent key management (Ed25519, DID:key, lock/unlock lifecycle)
- ✅ JWT-based capability/auth system (request → approve → generate token flow)
- ✅ Auth middleware on all GraphQL operations
- ✅ Perspectives & link CRUD with SPARQL queries (Oxigraph)
- ✅ Batch link mutations (`perspectiveLinkMutations`)
- ✅ SHACL subject classes (validation, typed CRUD, collections)
- ✅ Social DNA (`perspectiveAddSdna`)
- ✅ Language runtime with Web Worker sandboxing
- ✅ Language templating (parameter injection, `applyTemplateAndPublish`)
- ✅ Language registry (install, meta queries, source retrieval)
- ✅ Expression adapter (get/put expressions via language adapters)
- ✅ Language publication (in-memory content-addressed store)
- ✅ Full GraphQL schema (queries, mutations, subscriptions — complete spec coverage)
- ✅ GraphQL subscriptions (agent status, perspective/link changes, signals)
- ✅ Neighbourhood publish & join (p-diff-sync protocol)
- ✅ Telepresence (online status, signals, broadcasts)
- ✅ Friends system (add/remove/list)
- ✅ Trusted agents (add/remove/list)
- ✅ Link language template registry
- ✅ Entanglement proofs (add/delete/list/pre-flight)
- ✅ Cross-tab leader election (browser)
- ✅ IndexedDB persistence with auto-save (browser)
- ✅ Holochain conductor bridge (WebSocket, msgpack wire protocol)
- ✅ Reconnecting conductor with exponential backoff

## Placeholder Implementations

These resolve without error in the GraphQL schema but return defaults rather than real data:

- **Hosting & payments** — user info, credits, hot wallet, payment requests (needs hosting backend)
- **Holochain runtime info** — agent infos, network metrics (needs live conductor wiring)
- **Direct messaging** — friend send/status, message routing (needs DM language integration)
- **Language publication** — local in-memory only (needs Language Language for network distribution)
- **Entanglement proofs** — structure generated but no real cross-system binding
- **Agent signing** — `agentSignMessage`, `agentPermitCapability` (needs wiring to agent crypto)
- **SurrealDB queries** — `perspectiveQuerySurreal` returns empty (Oxigraph/SPARQL is the real query engine)
- **Runtime probes** — TLS domain returns null, readiness returns all-true

## Differences from Reference Implementation

|                  | Reference (ad4m-executor)   | ad4m-web                                       |
| ---------------- | --------------------------- | ---------------------------------------------- |
| Language         | Rust + Deno JS runtime      | Pure TypeScript                                |
| Holochain        | Embedded conductor          | External conductor via WebSocket               |
| Platform         | Desktop via Electron (Flux) | Any modern browser or Node.js                  |
| Installation     | Binary download / app store | `pnpm install` / open a URL                    |
| GraphQL          | HTTP + WebSocket server     | In-process execution                           |
| Key storage      | OS keychain / file system   | IndexedDB + Web Crypto (browser) / file (Node) |
| Language sandbox | Deno isolate                | Web Worker (browser) / in-process (Node)       |
| Code lineage     | —                           | Clean-room, no code reuse                      |

## License

MIT — see [LICENSE](./LICENSE).

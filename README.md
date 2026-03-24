# ad4m-web

A complete [AD4M](https://ad4m.dev) executor in pure TypeScript. No Electron, no Deno, no native dependencies. Runs in the browser or on Node.js — the only external requirement is a Holochain conductor for peer-to-peer networking.

**510 tests · ~13,400 LOC production · ~7,200 LOC tests · 4 packages**

## Architecture

```
┌──────────────────────────────────────────────────┐
│                    Browser Tab                    │
│  ┌──────────────┐        ┌─────────────────────┐ │
│  │  @ad4m-web   │  msg   │   SharedWorker /    │ │
│  │   /client    │◄──────►│   Service Worker    │ │
│  │  (SolidJS)   │        │  ┌───────────────┐  │ │
│  └──────────────┘        │  │  @ad4m-web    │  │ │
│                          │  │  /executor-   │  │ │
│                          │  │   browser     │  │ │
│                          │  │  ┌─────────┐  │  │ │
│                          │  │  │@ad4m-web│  │  │ │
│                          │  │  │  /core  │  │  │ │
│                          │  │  └─────────┘  │  │ │
│                          │  └───────┬───────┘  │ │
│                          └──────────┼──────────┘ │
└─────────────────────────────────────┼────────────┘
                                      │ WebSocket
                         ┌────────────▼────────────┐
                         │   Holochain Conductor   │
                         └─────────────────────────┘
```

| Package | Description |
| --- | --- |
| **`@ad4m-web/core`** | Platform-agnostic executor: agent crypto, perspectives, links, SHACL, SPARQL query generation, GraphQL schema, sync engine, capability auth, language runtime, expression system, neighbourhood management. Zero browser/Node dependencies. |
| **`@ad4m-web/executor-browser`** | Browser executor runtime: SharedWorker and Service Worker entry points, IndexedDB persistence, Web Worker language isolation, Oxigraph WASM triple store, `bootstrapExecutor()` factory. Runs the executor off the main thread. |
| **`@ad4m-web/client`** | Browser UI: Vite + SolidJS. Imports `executor-browser` for executor access. Holochain WebSocket bridge, UI components, demo pages. |
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
pnpm test         # 510 tests across 58 test files
```

## Implemented Features

- ✅ Agent key management (Ed25519, DID:key, lock/unlock lifecycle)
- ✅ JWT-based capability/auth system (request → approve → generate token flow)
- ✅ Auth middleware on all GraphQL operations
- ✅ Perspectives & link CRUD with SPARQL queries (Oxigraph WASM)
- ✅ SPARQL batch queries with comparison filters
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
- ✅ SharedWorker executor (off main thread, shared across tabs)
- ✅ Service Worker fallback (offline-capable GraphQL)
- ✅ IndexedDB persistence with auto-save (browser)
- ✅ Holochain conductor bridge (WebSocket, msgpack wire protocol)
- ✅ Reconnecting conductor with exponential backoff
- ✅ DNA extraction from language bundles at neighbourhood join
- ✅ Admin-granted capability tokens for zome call signing
- ✅ Cross-machine DHT peer discovery with reference AD4M

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
| GraphQL          | HTTP + WebSocket server     | In-process (SharedWorker / Service Worker)     |
| Key storage      | OS keychain / file system   | IndexedDB + Web Crypto (browser) / file (Node) |
| Language sandbox | Deno isolate                | Web Worker (browser) / in-process (Node)       |
| Code lineage     | —                           | Clean-room, no code reuse                      |

## License

CAL-1.0 (Cryptographic Autonomy License) — see [LICENSE](./LICENSE).

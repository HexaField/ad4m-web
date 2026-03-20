# Architecture

## Overview

ad4m-web runs a complete AD4M executor inside a browser tab. Where the reference implementation embeds a Rust binary with Deno and Holochain, this project is a clean-room TypeScript implementation that separates platform-agnostic logic from browser-specific bindings.

The monorepo contains two packages:

- **`@ad4m-web/core`** — Pure TypeScript. No `window`, `document`, `indexedDB`, `Worker`, or `WebSocket` imports. All platform-specific functionality is injected via interfaces. Can run in Node, Deno, Bun, or browser.
- **`@ad4m-web/client`** — Browser-specific implementations: IndexedDB, Web Workers, Oxigraph WASM, WebSocket Holochain bridge, cross-tab coordination. Vite + SolidJS single-page application.

---

## Module Deep Dive

### 1. Agent & Cryptography

**Files:** `core/src/agent/`

The agent module manages identity through Ed25519 key pairs and DID:key identifiers.

**State machine:**

```
Uninitialized → initialize(passphrase) → Initialized → unlock(passphrase) → Unlocked
```

- **`AgentService`** — Central agent controller. Manages the lifecycle: generate keys, lock/unlock wallet, create signed expressions. Emits status changes via `PubSub`.
- **`NobleCryptoProvider`** — Implements `CryptoProvider` using `@noble/ed25519` and `@noble/hashes/sha512`. Pure JS, no native crypto dependencies.
- **`generateDid()`** — Creates a `did:key` identifier from an Ed25519 public key using multicodec encoding (`0xed` prefix) and base58btc.
- **`signExpression()` / `verifyExpression()`** — Signs arbitrary data with the agent's private key, producing `{ key, signature }` proof objects. Verification extracts the public key from DID and checks the Ed25519 signature.
- **`CapabilityClaims`** — Defines capability tokens (`query`, `mutation`, `*`) for access control. `hasCapability()` checks claims against required permissions.

**Key types:**

- `AgentStatus` — `{ did, didDocument, isInitialized, isUnlocked }`
- `WalletStore` — Interface for encrypted key storage (browser: IndexedDB + AES-GCM)
- `WalletData` — `{ mainKey: { publicKey, privateKey }, additionalKeys? }`
- `CryptoProvider` — `{ generateKeyPair, sign, verify }`

### 2. Link Store

**Files:** `core/src/linkstore/`

Links are the fundamental data structure: `{ source, predicate, target }` triples that form the basis of all AD4M data.

- **`InMemoryLinkStore`** — Core's default implementation. Stores `LinkExpression` objects in a `Map<perspectiveUuid, LinkExpression[]>`. Supports query filtering by source/target/predicate/date range/limit. Provides `dump()`/`load()` for serialization.
- **`validateLink()`** — Ensures source and target are non-empty strings. Predicate is optional.
- **`LinkExpression`** — A signed link: `{ data: Link, author: string, timestamp: string, proof: { key, signature }, status? }`

**Query interface:**

```typescript
interface LinkQuery {
  source?: string
  target?: string
  predicate?: string
  fromDate?: string
  untilDate?: string
  limit?: number
}
```

The client provides `OxigraphLinkStore` (see Browser-Specific Architecture) for SPARQL support.

### 3. SHACL Engine

**Files:** `core/src/shacl/`

Provides semantic validation and typed CRUD over perspectives using SHACL (Shapes Constraint Language) shapes.

- **`ShaclEngine`** — Given a perspective's links, parses SHACL shape definitions stored as links, validates instances against those shapes, and provides high-level operations: `getSubjectData()`, `setSubjectData()`, `getSubjectCollection()`.
- **`ShaclParser`** — Extracts shape definitions from link data. A shape declares target class, property paths, value types, cardinality constraints, and collection semantics.
- **Literal handling** — `parseLiteral()` / `createLiteral()` encode typed values (string, number, boolean, datetime, JSON) as `literal://` URLs with embedded type annotations.

**Key types:**

- `ShaclShape` — `{ targetClass, properties: ShaclProperty[] }`
- `ShaclProperty` — `{ path, datatype, minCount, maxCount, class, collection?, singleValue? }`
- `SubjectData` — Generic typed instance data extracted from link triples

### 4. Language Runtime

**Files:** `core/src/language/`

Languages are the plugin system — JavaScript bundles that implement adapter interfaces for expression storage, link synchronization, and telepresence.

- **`LanguageManager`** — Registry of installed languages. Load/unload by address. Delegates bundle resolution (`BundleResolver`) and execution (`BundleExecutor`) to injected implementations.
- **`InProcessLanguageHost`** — Executes language bundles in the current JS context. Uses `new Function()` to evaluate bundle source with a synthetic `module`/`exports`/`require` environment and a `UTILS` object providing an FNV-1a `hash()` function.
- **`BundleResolver`** — Interface to fetch bundle source by address. `InMemoryBundleResolver` for testing; production would resolve from the language-language or HTTP.
- **`BundleExecutor`** — Interface to execute bundle source and return a `Language` object. Core provides `InProcessBundleExecutor`; client provides `WebWorkerBundleExecutor`.
- **`SharedLinkLanguageAdapter`** — Factory for link-language adapters that bridge `LinkSyncAdapter` to the sync engine.

**Language adapter interfaces:**

- `ExpressionAdapter` — `get(address)`, `put(content)` — store/retrieve expressions
- `LinkSyncAdapter` — `pull()`, `push(diff)`, `render(links)` — link synchronization
- `TelepresenceAdapter` — `setOnline()`, `getOnlineDIDs()`, `sendSignal()` — real-time presence
- `LanguageAdapter` — `getLanguageSource()` — meta-language for fetching other languages

### 5. Perspective Manager

**Files:** `core/src/perspective/`

The central coordinator. Perspectives are named containers of links — the user's primary workspace abstraction.

- **`PerspectiveManager`** — CRUD for perspectives (`add`, `remove`, `update`, `get`, `getAll`). Each perspective has a UUID, name, and optional neighbourhood URL. Link operations (`addLink`, `removeLink`, `queryLinks`) delegate to the `LinkStore`, sign expressions via the agent, and emit events through `PubSub`.
- **`restore()`** — Reconstitutes a perspective handle from persisted state without re-triggering creation logic.
- **SHACL integration** — `querySubjects()`, `getSubjectData()`, `setSubjectData()` delegate to the `ShaclEngine` scoped to a perspective.
- **Sync integration** — When a perspective has a neighbourhood, link mutations trigger `SyncEngine.commit()`. The manager provides `setSyncEngine()` to wire this up.
- **Event system** — `addEventListener()` returns an unsubscribe function. Events fire on any link or perspective mutation, driving the persistence auto-save system.

**Key types:**

- `PerspectiveHandle` — `{ uuid, name, neighbourhood?, sharedUrl? }`

### 6. Holochain Bridge

**Files:** `core/src/holochain/`, `client/src/holochain/`

The executor does NOT embed Holochain — it connects to an external conductor process via WebSocket.

**Core defines interfaces:**

- `HolochainConductor` — `connect()`, `disconnect()`, `generateAgentPubKey()`, `installApp()`, `callZome()`, `onSignal()`, `onStateChange()`
- `HolochainConnectionState` — `Disconnected → Connecting → Connected → Error`
- `CellId` — `{ dnaHash: Uint8Array, agentPubKey: Uint8Array }`
- `HolochainLanguageDelegateImpl` — Wraps a `HolochainConductor` to provide the delegate interface that languages use for Holochain operations.
- `MockHolochainConductor` — In-memory mock for testing.

**Client implements the wire protocol:**

- **`WebSocketHolochainConductor`** — Full implementation of the Holochain WebSocket wire protocol using `@msgpack/msgpack` for encoding.

  **Admin flow:**
  1. Connect WebSocket to admin port
  2. `generate_agent_pub_key` → receive agent public key
  3. `install_app` → provide hApp bundle/path, agent key, network seed
  4. `enable_app` → activate the installed app
  5. `attach_app_interface` → get a dynamic app port
  6. `issue_app_authentication_token` → receive auth token

  **App flow:**
  1. Connect WebSocket to app port
  2. Send `authenticate` message with token
  3. `call_zome` — msgpack-encoded with cell_id, zome_name, fn_name, payload, provenance, nonce, expiry

  All messages follow the `{ type, id, data }` wire format with msgpack encoding. Responses are correlated by request ID. Signals arrive asynchronously with cell_id and payload.

- **`ReconnectingHolochainConductor`** — Wraps `WebSocketHolochainConductor` with exponential backoff reconnection (base 1s, max 30s, up to 10 retries). Queues `callZome` requests during disconnection and drains them on reconnect.

### 7. Neighbourhood & Sync

**Files:** `core/src/neighbourhood/`

Multi-agent collaboration through shared perspectives.

- **`NeighbourhoodManager`** — `publishNeighbourhood()` creates a shared space from a perspective; `joinNeighbourhood()` joins one by URL. Both install the link language, wire up a `SyncEngine`, and connect the perspective for synchronization.
- **`SyncEngine`** — Implements the p-diff-sync protocol lifecycle:
  - `start()` — perform initial pull from the link language
  - `commit()` — push local link changes to the network
  - `handleRemoteDiff(diff)` — apply incoming changes to the local link store
  - State tracking: `currentRevision`, `lastSyncTimestamp`
  - Signal handling: listens for Holochain signals to trigger diff pulls
- **`parseNeighbourhoodUrl()` / `createNeighbourhoodUrl()`** — Encode/decode neighbourhood URLs: `neighbourhood://<linkLanguageAddress>/<metaDataExpression>`

### 8. Bootstrap & Executor

**Files:** `core/src/bootstrap/`

Wiring everything together.

- **`createExecutor(config)`** — Factory function that constructs the full dependency graph:
  1. Create `NobleCryptoProvider` (or use injected)
  2. Create `PubSub` for event distribution
  3. Create `AgentService` with crypto + wallet store
  4. Create `LinkStore` (InMemory or injected Oxigraph)
  5. Create `ShaclEngine` over the link store
  6. Create `LanguageManager` with host + optional resolver/executor
  7. Wire `LanguageContext` with live agent DID and signing
  8. Create `PerspectiveManager` with signing function
  9. Create `NeighbourhoodManager`
  10. Assemble `Executor` with all components
  11. Optionally create `PersistenceCoordinator`

- **`Executor`** — The root object holding references to all services: `agentService`, `perspectiveManager`, `languageManager`, `shaclEngine`, `linkStore`, `holochainDelegate`, `neighbourhoodManager`, `pubsub`.

- **`InMemoryContentStore`** — Simple in-memory expression store used by the neighbourhood manager for meta-expressions.

- **`BootstrapConfig`** — Specifies system language addresses (language-language, agent-language, neighbourhood-language, perspective-language).

### 9. GraphQL Engine

**Files:** `core/src/graphql/`

Full GraphQL schema executed in-process — no HTTP server. The browser IS the server.

- **`GraphQLEngine`** — Wraps `graphql-js` execution. Takes an `Executor`, builds the schema, executes queries/mutations/subscriptions against live executor state.
- **Schema** — Defines types (`Agent`, `AgentStatus`, `Perspective`, `PerspectiveHandle`, `Link`, `LinkExpression`, `ExpressionProof`, `Neighbourhood`), queries (`agent`, `agentStatus`, `perspectives`, `perspective`, `links`), mutations (`agentInitialize`, `agentUnlock`, `perspectiveAdd`, `perspectiveRemove`, `perspectiveUpdate`, `addLink`, `removeLink`, `neighbourhoodPublish`, `neighbourhoodJoin`, `languageInstall`), and subscriptions (`agentStatusChanged`, `perspectiveAdded`, `perspectiveLinkAdded`, `perspectiveLinkRemoved`).
- **`PubSub`** — Simple in-memory pub/sub for GraphQL subscriptions. `publish(topic, payload)`, `subscribe(topic)` returns `AsyncIterator`. Used by agent status changes, perspective mutations, and link operations.
- **Auth middleware** — `createAuthMiddleware()` wraps resolvers with capability checks. Validates `CapabilityClaims` from context against required permissions per operation.

### 10. Capabilities & Auth

**Files:** `core/src/agent/capabilities.ts`, `core/src/graphql/auth.ts`

Capability-based access control for GraphQL operations.

- `CapabilityClaims` — `{ capabilities: string[] }` where capabilities are strings like `query`, `mutation`, `*`.
- `hasCapability(claims, required)` — Checks if claims include the required capability or wildcard.
- Auth middleware intercepts GraphQL resolver execution, checking the request context for valid capability claims before allowing the operation to proceed.

### 11. Language Templating

**Files:** `core/src/language/bundle.ts` (templating logic within bundle resolver)

Creating new languages from templates:

- `BundleResolver.resolve(address, templateParams?)` — When template parameters are provided, the resolver fetches the base language bundle and applies parameter substitution before returning the source.
- Parameters are injected as `TEMPLATE_PARAMS` constants in the bundle source.
- Used by the neighbourhood system to create link languages from templates with specific DNA hashes and network seeds.

---

## Browser-Specific Architecture

### IndexedDB Persistence

**Files:** `client/src/persistence/`

All state survives page reloads through IndexedDB.

- **`IndexedDBKVStore`** — Generic key-value store over IndexedDB. Each logical store gets its own database name and object store. Used for agent state, perspective handles, and link store dumps.
- **`IndexedDBBlobStore`** — Binary store for language bundle caching.
- **`BrowserWalletStore`** — Encrypts agent keys at rest using PBKDF2 (100k iterations, SHA-256) → AES-256-GCM. Salt and IV stored alongside ciphertext. Keys never exist in plaintext in storage.
- **`PersistenceCoordinator`** — Orchestrates auto-save. Listens for perspective events via `addEventListener()`, marks state dirty, and flushes via a debounced writer (default 2s interval). Saves agent status, perspective handles, and full link store dump.

### Cross-Tab Coordination

**Files:** `client/src/coordination/`

Only one tab runs the executor; others proxy via the leader.

**Election protocol:**

1. Tab generates a stable ID (persisted in `sessionStorage`)
2. On start, broadcasts `announce` with timestamp via `BroadcastChannel`
3. After 500ms election timeout, the tab with the lowest timestamp wins
4. Winner broadcasts `leader-claim`; others acknowledge and become followers

**Leader responsibilities:**

- Runs the full executor and GraphQL engine
- Sends heartbeats every 2s
- Handles `graphql-request` messages from followers, executes them, returns `graphql-response`

**Follower behavior:**

- `ProxyGraphQLEngine` forwards all queries to the leader via `BroadcastChannel`
- Watches for heartbeats; if none received for 6s, triggers re-election
- On `leader-leaving` message, immediately re-elects

**Failover:** If a leader tab closes (fires `beforeunload`), it broadcasts `leader-leaving`. If it crashes, followers detect via heartbeat timeout and re-elect.

### Web Worker Isolation

**Files:** `client/src/language/`

Language bundles execute in dedicated Web Workers for sandboxed isolation.

- **`WebWorkerBundleExecutor`** — For each language bundle:
  1. Generates a worker script as a Blob URL
  2. Spawns a `Worker`
  3. Sends `init` message with bundle source and serialized context
  4. Worker evaluates bundle via `new Function()`, calls `create(context)`
  5. Returns a `WorkerLanguageProxy` — a Proxy object that forwards all adapter method calls via `postMessage`

- **`WorkerLanguageProxy`** — Creates adapter proxies dynamically. Each method call on `expressionAdapter`, `linksAdapter`, etc. becomes a `{ type: 'call', adapter, method, args }` message. Responses correlate by ID. 30s init timeout.

- **`UTILS.hash()`** — FNV-1a hash implementation provided to language bundles in both worker and in-process contexts. Lightweight, deterministic, no crypto dependency.

- **Fallback** — When `Worker` is undefined (Node/SSR), falls back to `executeInProcess()` using the same `new Function()` approach on the main thread.

### Oxigraph WASM

**Files:** `client/src/linkstore/`

Full RDF triple store running in the browser via Oxigraph compiled to WASM.

- **`OxigraphLinkStore`** — Implements the core `LinkStore` interface with Oxigraph backing:
  - Each perspective gets a named graph: `urn:ad4m:perspective:{uuid}`
  - Links are stored as RDF quads: `(source, predicate, target, graph)`
  - A sidecar `Map` stores metadata that doesn't fit in RDF: author, timestamp, proof, status
  - Default predicate `ad4m://default_predicate` when none specified
  - Deduplication via composite key: `source|predicate|target|author|timestamp`
  - `querySparql()` — Execute arbitrary SPARQL queries against the store
  - `dump()`/`load()` — Serialize as N-Quads + JSON sidecar for persistence

---

## Holochain Integration

The executor connects to an external Holochain conductor via WebSocket. The conductor runs as a separate process (see `conductor-config.yaml`).

**Wire protocol:** All messages are msgpack-encoded `{ type, id, data }` envelopes.

| Message Type   | Direction          | Purpose                              |
| -------------- | ------------------ | ------------------------------------ |
| `request`      | Client → Conductor | Admin or app API call                |
| `response`     | Conductor → Client | Correlated reply (by `id`)           |
| `signal`       | Conductor → Client | Async event (e.g., remote peer diff) |
| `authenticate` | Client → Conductor | App interface auth with token        |

**Admin API sequence:**

```
GenerateAgentPubKey → InstallApp → EnableApp → AttachAppInterface → IssueAuthToken
```

**App API:** After authentication, `CallZome` requests include cell_id, zome/fn names, msgpack-encoded payload, provenance (agent key), nonce, and microsecond expiry timestamp.

**Network topology:** Each browser connects to its own conductor. Conductors peer with each other via WebRTC through a bootstrap server (`https://bootstrap.ad4m.dev:4433`). The p-diff-sync DNA provides the link synchronization protocol between agents.

---

## Data Flow Examples

### 1. Agent Creates a Link

```
User action
  → PerspectiveManager.addLink(perspectiveUuid, link)
    → AgentService.createSignedExpression(link) → { author, timestamp, proof }
    → LinkStore.addLink(perspectiveUuid, signedLink)
    → PubSub.publish('perspective-link-added', { uuid, link })
    → If perspective has neighbourhood:
      → SyncEngine.commit() → LinkSyncAdapter.push(diff)
        → Holochain callZome → broadcast to peers
```

### 2. Remote Agent's Link Arrives

```
Holochain conductor signal
  → WebSocketHolochainConductor.onSignal callbacks
    → LinkSyncAdapter receives diff
      → SyncEngine.handleRemoteDiff(diff)
        → PerspectiveManager.addLinks(perspectiveUuid, remoteLinks)
          → LinkStore.addLinks(perspectiveUuid, links)
          → PubSub.publish('perspective-link-added', { uuid, link })
            → GraphQL subscription fires → client UI updates
```

### 3. SHACL Subject Query

```
GraphQL query { perspectiveQuerySubjects(uuid, className) }
  → GraphQLEngine resolves
    → PerspectiveManager.querySubjects(uuid, className)
      → ShaclEngine.getSubjectCollection(perspectiveUuid, className)
        → LinkStore.queryLinks() to find shape definition links
        → ShaclParser.parseShape() → property constraints
        → LinkStore.queryLinks() to find matching instances
        → Validate instances against shape constraints
        → Return typed subject data
```

---

## Security Model

- **Agent keys never leave the browser.** Private keys are encrypted with AES-256-GCM (PBKDF2-derived key) and stored in IndexedDB. They exist in memory only while the agent is unlocked.
- **Language bundles are sandboxed in Web Workers.** No access to main thread globals, IndexedDB, or the DOM. Communication only via structured message passing.
- **Capability-based auth** for GraphQL operations. Each request carries capability claims that are checked against operation requirements.
- **Holochain provides cryptographic integrity** at the network layer — source chain validation, countersigning, and DHT redundancy.

---

## Build & Development

| Aspect            | Detail                                                       |
| ----------------- | ------------------------------------------------------------ |
| Language          | TypeScript 5.9, strict mode                                  |
| Compiler settings | `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters` |
| Style             | No enums — const objects + type aliases throughout           |
| Core constraints  | Zero runtime dependencies on browser or Node APIs            |
| Testing           | Vitest — 251 core tests, 34 client tests                     |
| Client build      | Vite + SolidJS + Tailwind CSS                                |
| Core build        | Rollup with TypeScript plugin                                |
| Linting           | oxlint + oxfmt                                               |
| Package manager   | pnpm workspaces                                              |

---

## Differences from Reference Implementation

|                  | Reference (ad4m-executor)   | ad4m-web                                 |
| ---------------- | --------------------------- | ---------------------------------------- |
| Language         | Rust + Deno JS runtime      | Pure TypeScript                          |
| Holochain        | Embedded conductor          | External conductor via WebSocket         |
| Platform         | Desktop via Electron (Flux) | Any modern browser                       |
| Installation     | Binary download / app store | Open a URL                               |
| GraphQL          | HTTP + WebSocket server     | In-process execution                     |
| Key storage      | OS keychain / file system   | IndexedDB + Web Crypto                   |
| Language sandbox | Deno isolate                | Web Worker                               |
| Code lineage     | —                           | Clean-room implementation, no code reuse |

Both implement the same AD4M specification and are interoperable at the network level through shared Holochain DNAs and the same GraphQL schema.

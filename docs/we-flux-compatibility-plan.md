# Running WE and Flux on ad4m-web — Drop-in Replacement Plan

## Goal

Run **WE** (social browser) and **Flux** (AD4M admin UI) on top of **ad4m-web** entirely in the browser, replacing the native AD4M executor without code changes to WE or Flux. No Node.js server — pure browser execution.

## Architecture

### Current Stack (Reference AD4M)

```
WE / Flux (browser)
    ↓ WebSocket
@coasys/ad4m-connect → Ad4mClient
    ↓ GraphQL over WS
AD4M Executor (Rust, native binary)
    ↓
Holochain + SurrealDB + Prolog
```

### Target Stack (ad4m-web)

```
WE / Flux (browser, UNMODIFIED)
    ↓ in-process (BroadcastChannel / MessagePort)
@coasys/ad4m-connect (patched transport)
    ↓ GraphQL (in-memory, no network)
ad4m-web Executor (SharedWorker)
    ├── Oxigraph WASM (SPARQL)
    └── Holochain conductor WebSocket (external)
```

**No Node.js server. No WebSocket server. Everything runs in the browser.**

The executor runs in a `SharedWorker` so multiple tabs (WE, Flux, etc.) share one executor instance. Communication uses `BroadcastChannel` or `MessagePort` with a thin adapter that presents the `graphql-transport-ws` protocol interface to `@coasys/ad4m-connect`.

## Compatibility Surface

### What WE imports from `@coasys/ad4m`

- `Ad4mModel`, `ModelOptions`, `Property`, `Optional`, `Collection` — **model decorators (✅ implemented)**
- `Ad4mClient` — GraphQL client
- `PerspectiveProxy` — perspective operations
- `Agent`, `Literal`, `AITask`, `AIPromptExamples` — types
- `capSentence` — utility

### What Flux imports from `@coasys/ad4m`

- `Ad4mClient`, `ExceptionType` — client + error types
- `Link`, `Literal`, `LinkExpression` — data types
- `Agent`, `LanguageMeta`, `PerspectiveProxy` — domain types
- `UserStatistics`, `ImportResult`, `ImportStats` — admin types
- `ModelInput`, `Model`, `Notification` — AI/runtime types

### Connection Path (Current)

Both use `@coasys/ad4m-connect` which:

1. Discovers the executor (URL, port)
2. Opens a WebSocket to the GraphQL endpoint
3. Returns an `Ad4mClient` instance
4. `Ad4mClient` wraps all GraphQL queries/mutations/subscriptions

### Connection Path (ad4m-web)

We intercept at the transport layer:

1. `@coasys/ad4m-connect` is configured with a custom transport (or we patch `Ad4mClient` construction)
2. Instead of opening a real WebSocket, the transport uses `BroadcastChannel` / `MessagePort` to talk to the SharedWorker
3. The SharedWorker runs the full GraphQL engine in-process
4. Responses flow back through the same channel
5. From `Ad4mClient`'s perspective, nothing changed — it still sends GraphQL operations and gets responses

## Implementation Phases

### Phase 1: In-Browser GraphQL Engine + SharedWorker Transport

ad4m-web already has the full GraphQL schema (`packages/core/src/graphql/schema.ts`) and execution engine.

#### 1a. SharedWorker Executor Host

Create `packages/client/src/executor/shared-worker.ts`:

- Runs the full ad4m-web executor (bootstrap, agent, perspectives, Oxigraph, Holochain WS)
- Listens for GraphQL operations via `MessagePort` (from connecting tabs)
- Executes queries/mutations/subscriptions against the in-memory schema
- Returns results through the same port

```typescript
// shared-worker.ts (runs in SharedWorker context)
self.onconnect = (e: MessageEvent) => {
  const port = e.ports[0]
  port.onmessage = async (msg) => {
    const { id, type, payload } = msg.data
    if (type === 'subscribe' || type === 'next') {
      // graphql-transport-ws protocol messages
      const result = await executor.execute(payload)
      port.postMessage({ id, type: 'next', payload: result })
    }
  }
}
```

#### 1b. WebSocket-Compatible Transport Adapter

Create `packages/client/src/api/worker-transport.ts`:

- Implements the same interface that `graphql-ws` client expects (or wraps as a fake `WebSocket`)
- Routes operations to the SharedWorker via `MessagePort`
- Handles the `graphql-transport-ws` protocol (connection_init, subscribe, next, complete)
- Presents as a normal WebSocket to `@coasys/ad4m-connect` / `Ad4mClient`

```typescript
// Fake WebSocket that routes to SharedWorker
export class WorkerWebSocket implements WebSocket {
  private worker: SharedWorker
  private port: MessagePort

  send(data: string) {
    const msg = JSON.parse(data) // graphql-transport-ws message
    this.port.postMessage(msg)
  }

  // Route worker responses back as WebSocket 'message' events
}
```

#### 1c. Bootstrap Integration

Create `packages/client/src/executor/browser-bootstrap.ts`:

- Starts the SharedWorker
- Returns the `WorkerWebSocket` transport
- `Ad4mConnect` or `Ad4mClient` uses this transport instead of a real WebSocket

For WE/Flux integration, two options:

- **Monkey-patch**: Override `WebSocket` constructor for the GraphQL endpoint URL
- **Fork ad4m-connect**: Add a `transport` option (cleaner, small PR to upstream)
- **Wrapper**: Wrap `Ad4mClient` construction to inject our transport

#### Tasks

1. SharedWorker host that runs executor + GraphQL engine
2. `graphql-transport-ws` protocol handler (parse/serialize messages)
3. `WorkerWebSocket` adapter (fake WebSocket over MessagePort)
4. Browser bootstrap that wires everything together
5. Tests: send GraphQL operation → get response through worker transport

### Phase 2: Ad4mClient Compatibility

Our schema must match the reference's GraphQL schema exactly for `Ad4mClient` methods to work.

#### Current GraphQL coverage:

- 29/29 queries ✅
- 40/40 mutations ✅
- 12/12 subscriptions ✅

#### Gaps to verify:

1. **Return type shapes** — field names, nullability, nested types must match exactly
2. **Error format** — must return GraphQL errors in the expected format
3. **Subscription delivery** — must push events through the MessagePort in the correct `graphql-transport-ws` format

#### Tasks

1. Create a GraphQL schema conformance test that compares our schema against the reference
2. Fix any field name/type mismatches
3. Ensure subscription events fire with the correct payload shapes through the worker transport

### Phase 3: `@coasys/ad4m-connect` Compatibility

`ad4m-connect` handles:

- Executor discovery (URL/port)
- Authentication (capability request/grant)
- WebSocket connection setup
- Returns `Ad4mClient`

For ad4m-web in-browser:

1. **Discovery**: Skip — executor is already running in the SharedWorker
2. **Auth**: The SharedWorker executor auto-grants capabilities for same-origin tabs (no external auth needed in pure browser mode)
3. **Client creation**: Provide a helper that returns `Ad4mClient` wired to the worker transport

```typescript
import { getAd4mWebClient } from '@ad4m-web/client'

// Returns Ad4mClient connected to in-browser executor
const client = await getAd4mWebClient()
```

For drop-in with unmodified WE/Flux, we need a shim:

```typescript
// Shim that replaces @coasys/ad4m-connect in the build
export default function Ad4mConnect(opts) {
  return {
    async getAd4mClient() {
      return getAd4mWebClient()
    }
  }
}
```

This shim can be injected via bundler alias (`resolve.alias` in Vite) — **zero code changes to WE/Flux**.

#### Tasks

1. `getAd4mWebClient()` helper in `@ad4m-web/client`
2. `ad4m-connect` shim module
3. Document bundler alias configuration for WE/Flux builds

### Phase 4: PerspectiveProxy Compatibility

`PerspectiveProxy` is the main interface WE uses for data operations. It wraps GraphQL calls for:

- `queryLinks()`, `addLink()`, `removeLink()`
- `querySurrealDB()` → translate to SPARQL, return compatible JSON
- `infer()` → return empty results (WE may not use it)
- `executeAction()` → SHACL actions
- `createSubject()`, `removeSubject()` → subject class operations
- `stringOrTemplateObjectToSubjectClassName()` → class name resolution

Since `PerspectiveProxy` communicates via `Ad4mClient` (GraphQL), it works automatically once the schema matches. The key translation is:

- `perspectiveQuerySurrealDB(query)` → parse SurrealQL, translate to SPARQL, execute against Oxigraph, return JSON in the same shape SurrealDB would
- `perspectiveInfer(query)` → stub returning empty results

#### Tasks

1. SurrealQL → SPARQL translator for common query patterns used by Ad4mModel
2. Implement `perspectiveInfer` stub
3. Verify all `PerspectiveProxy` methods work through the in-browser GraphQL layer

### Phase 5: WE Model Compatibility

WE defines models using `@coasys/ad4m` decorators. Since WE imports from `@coasys/ad4m` and operations go through `PerspectiveProxy` → `Ad4mClient` → GraphQL → our executor, the decorator implementation doesn't matter — only the executor's response to GraphQL operations matters.

WE's models (`Block`, `Space`) call `Ad4mModel.create()`, `.findAll()`, `.save()`, `.delete()` which internally call `PerspectiveProxy` methods which are GraphQL calls. Our executor handles those GraphQL operations using our SPARQL-backed implementation.

**No code changes to WE. No import changes. The executor is the compatibility layer.**

#### Tasks

1. Verify WE's `Block` and `Space` models work end-to-end through the in-browser executor
2. Test: create Block → findAll → update → delete cycle
3. Test: Collection operations (comments, reactions on Block)

### Phase 6: Language System Stubs

WE and Flux interact with the language system for:

- Expression creation (via `resolveLanguage`)
- Language installation
- Template application

For a working demo:

1. `literal` resolve language — already works (literal:// URIs)
2. Language listing — return installed languages from our registry
3. Language source — serve bundled languages

Full language marketplace is not needed for the initial drop-in.

### Phase 7: AI / Hosting / Admin Stubs

Flux uses AI endpoints (`ModelInput`, `AITask`, etc.) and admin features (`UserStatistics`, `ImportResult`). Return sensible defaults:

- AI: empty model list, no-op for prompts
- Hosting: return "self-hosted" status
- Admin: return basic stats from perspective count + link count

## What Needs to Match Exactly

| Layer                        | Must Match                                  | Notes                           |
| ---------------------------- | ------------------------------------------- | ------------------------------- |
| **GraphQL schema**           | Field names, types, nullability             | Our schema already targets spec |
| **Transport protocol**       | `graphql-transport-ws` message format       | Implemented in worker transport |
| **Auth flow**                | Capability request → grant → token          | Auto-grant for same-origin tabs |
| **Subscription events**      | Payload shapes for link/perspective changes | Already implemented via PubSub  |
| **PerspectiveProxy methods** | All methods used by WE                      | Core CRUD + subject class ops   |
| **Ad4mModel static methods** | `create`, `findAll`, `save`, `delete`       | Works through PerspectiveProxy  |
| **Literal encoding**         | `literal://string:X` URI format             | Already matches                 |

## What Can Be Stubbed

| Feature                          | Stub Approach                   | Impact                             |
| -------------------------------- | ------------------------------- | ---------------------------------- |
| AI/LLM integration               | Empty model list, no-op         | Flux AI tab empty                  |
| Hosting/payments                 | Return "self-hosted"            | Flux hosting tab shows self-hosted |
| Language marketplace             | Return installed languages only | No new language installation       |
| Runtime info (Holochain version) | Return ad4m-web version         | Cosmetic                           |
| Agent import/export              | No-op                           | Settings feature unavailable       |
| SurrealDB queries                | Translate to SPARQL             | Transparent to callers             |
| Prolog inference                 | Return empty results            | WE doesn't use it directly         |

## Deployment

### Single Mode: Pure Browser

```
Browser
├── SharedWorker (ad4m-web executor)
│   ├── GraphQL engine (in-memory)
│   ├── Oxigraph WASM (SPARQL)
│   ├── Holochain conductor WebSocket (to external conductor)
│   └── Ad4mModel / SHACL / Perspectives / Agent
│
├── Tab 1: WE (unmodified)
│   └── @coasys/ad4m-connect (shimmed) → MessagePort → SharedWorker
│
├── Tab 2: Flux (unmodified)
│   └── @coasys/ad4m-connect (shimmed) → MessagePort → SharedWorker
│
└── Tab N: Any AD4M app
    └── Same pattern
```

The only external dependency is a **Holochain conductor** running somewhere accessible via WebSocket (localhost, LAN, or remote). Everything else runs in the browser.

### Future: Embedded Mode

```
WE / Flux imports @ad4m-web/core directly
    ├── No transport layer, no GraphQL overhead
    ├── Direct API calls to executor
    └── Oxigraph WASM + Holochain WS

Requires import changes in WE/Flux — not a priority.
```

## Integration with WE/Flux Builds

To use ad4m-web as the executor with **zero code changes**:

```typescript
// vite.config.ts for WE or Flux
export default defineConfig({
  resolve: {
    alias: {
      // Replace ad4m-connect with our shim
      '@coasys/ad4m-connect': '@ad4m-web/client/connect-shim'
    }
  }
})
```

The shim starts the SharedWorker executor on first use and returns an `Ad4mClient` connected to it. WE/Flux code is completely unaware it's talking to an in-browser executor.

## Test Plan

1. **Transport test**: Send GraphQL operation through WorkerWebSocket → get response from SharedWorker
2. **Schema conformance**: Compare introspected schema from reference AD4M vs ad4m-web
3. **Smoke test**: `getAd4mWebClient()` returns working `Ad4mClient`
4. **Agent flow**: `agentGenerate` → `agentStatus` returns DID
5. **Perspective flow**: Create perspective → add link → query links → remove
6. **Model flow**: WE's `Block` model → `create()` → `findAll()` → `save()` → `delete()`
7. **Subscription flow**: Subscribe to link changes → add link → receive event
8. **Multi-tab**: Two tabs share executor state via SharedWorker
9. **Neighbourhood flow**: Create neighbourhood → join from second browser → sync via Holochain
10. **Flux integration**: Open Flux with alias → authenticate → see perspectives list

## Estimated Work

| Phase                             | Effort | Dependency |
| --------------------------------- | ------ | ---------- |
| Phase 1: SharedWorker + Transport | Medium | None       |
| Phase 2: Schema Conformance       | Small  | Phase 1    |
| Phase 3: ad4m-connect Shim        | Small  | Phase 1    |
| Phase 4: PerspectiveProxy         | Medium | Phase 2    |
| Phase 5: WE Model Testing         | Small  | Phase 4    |
| Phase 6: Language Stubs           | Small  | Phase 2    |
| Phase 7: Admin Stubs              | Small  | Phase 2    |

Phase 1-3 are the critical path. Once the SharedWorker executor runs and the ad4m-connect shim works, WE and Flux should function with remaining gaps being runtime errors from missing stubs (easily fixed incrementally).

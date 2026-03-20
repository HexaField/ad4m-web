# Running WE and Flux on ad4m-web — Drop-in Replacement Plan

## Goal

Run **WE** (social browser) and **Flux** (AD4M admin UI) on top of **ad4m-web** in the browser, replacing the native AD4M executor without code changes to WE or Flux.

## Architecture Overview

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
    ↓ WebSocket (same protocol)
@coasys/ad4m-connect → Ad4mClient
    ↓ GraphQL over WS
ad4m-web Executor (TypeScript, in-browser or lightweight server)
    ↓
Holochain conductor (external) + Oxigraph WASM (SPARQL)
```

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

### Connection Path

Both use `@coasys/ad4m-connect` which:

1. Discovers the executor (URL, port)
2. Opens a WebSocket to the GraphQL endpoint
3. Returns an `Ad4mClient` instance
4. `Ad4mClient` wraps all GraphQL queries/mutations/subscriptions

**Key insight**: `Ad4mClient` communicates purely via GraphQL over WebSocket. If ad4m-web serves the same GraphQL schema on the same WS endpoint, WE and Flux work unchanged.

## Implementation Phases

### Phase 1: GraphQL WS Server

ad4m-web already has the full GraphQL schema (`packages/core/src/graphql/schema.ts`). Need to serve it over WebSocket.

**Options:**

**A. In-browser GraphQL server (recommended for pure browser mode)**

- ad4m-web runs the executor in the browser
- WE/Flux also run in the same browser
- Use `BroadcastChannel` or `SharedWorker` for in-process GraphQL routing
- `@coasys/ad4m-connect` needs a custom transport adapter that routes to the in-process executor instead of WebSocket

**B. Lightweight Node.js server**

- `packages/server/` already exists
- Add `graphql-ws` server on a WebSocket endpoint
- WE/Flux connect to `ws://localhost:12000/graphql` (same as reference)
- Executor runs in Node.js with Oxigraph

**C. Hybrid — Server-side executor, browser clients**

- Best of both: server handles Holochain conductor connection + persistence
- Browser clients connect via standard WebSocket
- Most compatible with existing WE/Flux code

**Recommendation: Phase 1 uses Option B (Node.js server) for maximum compatibility. Option A is a follow-up for pure-browser deployment.**

#### Tasks

1. Add `graphql-ws` to `packages/server/`
2. Create `ws-graphql-server.ts` — WebSocket handler serving the existing schema
3. Serve on port `12000` (matching reference default)
4. Handle `graphql-transport-ws` protocol (used by `@coasys/ad4m-connect`)

### Phase 2: Ad4mClient Compatibility

`Ad4mClient` from `@coasys/ad4m` wraps all GraphQL calls with typed methods. Our schema must match the reference's GraphQL schema exactly.

#### Current GraphQL coverage (from README):

- 29/29 queries ✅
- 40/40 mutations ✅
- 12/12 subscriptions ✅

#### Gaps to verify:

1. **Return type shapes** — field names, nullability, nested types must match exactly
2. **Error format** — must return GraphQL errors in the expected format
3. **Subscription protocol** — `graphql-ws` vs `subscriptions-transport-ws` (legacy)

#### Tasks

1. Create a GraphQL schema conformance test that compares our schema against the reference
2. Fix any field name/type mismatches
3. Ensure subscription events fire with the correct payload shapes

### Phase 3: `@coasys/ad4m-connect` Compatibility

`ad4m-connect` handles:

- Executor discovery (URL/port)
- Authentication (capability request/grant)
- WebSocket connection setup
- Returns `Ad4mClient`

For ad4m-web:

1. **Discovery**: Configure `ad4m-connect` to point at our server (`ws://localhost:12000/graphql`)
2. **Auth**: Implement the capability request/grant flow in our GraphQL resolvers (already has `hasCapability`, `isAdminCredential`, `createAdminCapabilities`)
3. **Test**: `Ad4mConnect({ appUrl: 'ws://localhost:12000' }).getAd4mClient()` returns a working client

### Phase 4: PerspectiveProxy Compatibility

`PerspectiveProxy` is the main interface WE uses for data operations. It wraps GraphQL calls for:

- `queryLinks()`, `addLink()`, `removeLink()`
- `querySurrealDB()` → needs to work (translate to SPARQL or return compatible results)
- `infer()` → can return empty/error (WE may not use it)
- `executeAction()` → SHACL actions
- `createSubject()`, `removeSubject()` → subject class operations
- `stringOrTemplateObjectToSubjectClassName()` → class name resolution

#### Tasks

1. Ensure `perspectiveQuerySurrealDB` translates to SPARQL internally (or returns compatible JSON)
2. Implement `perspectiveInfer` as a stub (return empty results)
3. Verify all `PerspectiveProxy` methods work through the GraphQL layer

### Phase 5: WE Model Compatibility

WE defines models using `@coasys/ad4m` decorators:

```typescript
import { Ad4mModel, Collection, ModelOptions, Property, Optional } from '@coasys/ad4m'

@ModelOptions({ name: 'Block' })
class Block extends Ad4mModel { ... }

@ModelOptions({ name: 'Space' })
class Space extends Ad4mModel { ... }
```

**Option A**: WE continues importing from `@coasys/ad4m` — our executor understands the same SHACL shapes and serves the same GraphQL. Ad4mModel operations go through `PerspectiveProxy` → GraphQL → our executor. **No code changes to WE.**

**Option B**: WE imports from `@ad4m-web/core` instead. Requires changing imports. Only needed if we want WE to use SPARQL directly (bypassing GraphQL).

**Recommendation: Option A for drop-in compatibility. Option B as a future optimization.**

#### Tasks

1. Verify WE's `Block` and `Space` models work with our executor
2. Test: create Block → findAll → update → delete cycle through the GraphQL layer

### Phase 6: Language System Stubs

WE and Flux interact with the language system for:

- Expression creation (via `resolveLanguage`)
- Language installation
- Template application

ad4m-web has stubs for most language operations. For a working demo:

1. `literal` resolve language — already works (literal:// URIs)
2. Language listing — return installed languages from our registry
3. Language source — serve bundled languages

Full language marketplace is not needed for the initial drop-in.

### Phase 7: AI / Hosting / Admin Stubs

Flux uses AI endpoints (`ModelInput`, `AITask`, etc.) and admin features (`UserStatistics`, `ImportResult`). These can return sensible defaults:

- AI: empty model list, no-op for prompts
- Hosting: return "self-hosted" status
- Admin: return basic stats from perspective count + link count

## What Needs to Match Exactly

| Layer                        | Must Match                                  | Notes                           |
| ---------------------------- | ------------------------------------------- | ------------------------------- |
| **GraphQL schema**           | Field names, types, nullability             | Our schema already targets spec |
| **WebSocket protocol**       | `graphql-transport-ws`                      | Used by `@coasys/ad4m-connect`  |
| **Auth flow**                | Capability request → grant → token          | Already partially implemented   |
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

## Deployment Modes

### Mode 1: Node.js Server (easiest drop-in)

```
ad4m-web server (Node.js, port 12000)
    ├── GraphQL WS endpoint
    ├── Oxigraph (SPARQL)
    └── Holochain conductor connection

WE / Flux browser → ws://localhost:12000/graphql
```

### Mode 2: Pure Browser (future)

```
ad4m-web executor (SharedWorker / Service Worker)
    ├── GraphQL engine (in-memory)
    ├── Oxigraph WASM (SPARQL)
    └── Holochain conductor WebSocket

WE / Flux (same browser) → BroadcastChannel / MessagePort
```

Requires a custom `@coasys/ad4m-connect` transport or a thin wrapper that mimics the WebSocket API over `BroadcastChannel`.

### Mode 3: Embedded (future)

```
WE / Flux imports @ad4m-web/core directly
    ├── No WebSocket, no GraphQL
    ├── Direct API calls
    └── Oxigraph WASM + Holochain WS

Requires import changes in WE/Flux.
```

## Test Plan

1. **Schema conformance**: Compare introspected schema from reference AD4M vs ad4m-web
2. **Smoke test**: `Ad4mConnect({ appUrl: 'ws://localhost:12000' }).getAd4mClient()` succeeds
3. **Agent flow**: `agentGenerate` → `agentStatus` returns DID
4. **Perspective flow**: Create perspective → add link → query links → remove
5. **Model flow**: WE's `Block` model → `create()` → `findAll()` → `save()` → `delete()`
6. **Subscription flow**: Subscribe to link changes → add link → receive event
7. **Neighbourhood flow**: Create neighbourhood → join from second client → sync
8. **Flux login**: Open Flux UI → authenticate → see perspectives list

## Estimated Work

| Phase                        | Effort | Dependency |
| ---------------------------- | ------ | ---------- |
| Phase 1: GraphQL WS Server   | Small  | None       |
| Phase 2: Schema Conformance  | Small  | Phase 1    |
| Phase 3: ad4m-connect Compat | Small  | Phase 1    |
| Phase 4: PerspectiveProxy    | Medium | Phase 2    |
| Phase 5: WE Model Testing    | Small  | Phase 4    |
| Phase 6: Language Stubs      | Small  | Phase 2    |
| Phase 7: Admin Stubs         | Small  | Phase 2    |

Phase 1-3 are the critical path. Once the GraphQL WS server matches the schema and ad4m-connect can connect, WE and Flux should work with remaining gaps being runtime errors from missing stubs (easily fixed incrementally).

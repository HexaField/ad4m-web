# Migration Guide: ad4m-web ↔ Reference Implementation Gaps

**Date:** 2026-03-20 **Based on:** AD4M Protocol Spec v0.2.0 (PR #682) + reference at `origin/dev` (commit `f5190d63d`)

This document lists every gap between what ad4m-web currently implements and what the reference AD4M executor requires for interoperability. Each gap includes what the reference does, what ad4m-web has, what needs to change, and priority.

---

## 1. PerspectiveDiffSync Adapter (CRITICAL)

### What the reference does

The reference uses a real Holochain-backed p-diff-sync language with:

- **`linksAdapter.ts`** (~356 lines): Full `LinkSyncAdapter` implementation that calls Holochain zome functions (`commit`, `current_revision`, `pull`, `render`, `sync`). Maintains peer revision tracking, gossip/pull loops, snapshot scheduling, chunked diff support.
- **`telepresenceAdapter.ts`** (~43 lines): `TelepresenceAdapter` calling `set_online_status`, `get_online_agents`, `send_signal`, `send_broadcast`, `create_did_pub_key_link` zome functions.
- **`index.ts`**: Language entry point wiring both adapters with `HolochainLanguageDelegate`.

**Key files:** `~/Desktop/ad4m/bootstrap-languages/p-diff-sync/linksAdapter.ts`, `telepresenceAdapter.ts`, `index.ts`

### What ad4m-web has

- **`packages/core/src/language/shared-link-language.ts`** (152 lines): In-memory `SharedLinkStore` mock. No Holochain, no network sync, no revision tracking, no peer awareness, no signals.
- **`packages/core/src/neighbourhood/sync-engine.ts`** (110 lines): Wraps the link language's `LinkSyncAdapter` interface but relies on whatever adapter the language provides.

### What needs to change

1. Implement a real `LinkSyncAdapter` that calls Holochain zome functions through the delegate:
   - `commit(diff)` → zome `commit` call, returns `ActionHash`
   - `currentRevision()` → zome `current_revision` call
   - `pull(hash)` → zome `pull` call, returns diffs to apply
   - `render()` → zome `render` call, returns full state
   - `sync()` → trigger gossip cycle
2. Implement peer revision tracking: on `HashBroadcast` signal, record peer revision + trigger pull
3. Implement `TelepresenceAdapter` calling the corresponding zome functions
4. Wire signal handling (see gap #5)

**Files to modify:** `packages/core/src/language/shared-link-language.ts` (replace or supplement), `packages/core/src/neighbourhood/sync-engine.ts`

**Priority:** 🔴 CRITICAL — Without this, ad4m-web cannot sync with reference nodes.

---

## 2. Holochain Delegate in Worker (CRITICAL)

### What the reference does

- **`rust-executor/src/js_core/language_bootstrap.js`** (293 lines): Creates a `HolochainLanguageDelegate` for every language runtime. Provides:
  - `callZomeFunction(cellId, zomeName, fnName, payload)` — calls through to the Holochain conductor
  - `registerSignalCallbacksForApp(appInfo, callback, languageAddress)` — registers signal handlers per cell_id
  - `installApp(agentPubKey, networkSeed, membraneProofs)` — installs Holochain apps
  - Signal dispatch via `__handleHolochainSignal__` global
  - Binary marker conversion (`__binary` → `Uint8Array`)
  - DOM polyfills for Svelte-based language bundles

### What ad4m-web has

- **`packages/core/src/holochain/delegate.ts`** (67 lines): Minimal delegate with `callZomeFunction`, `installApp`, `getDnaDefinition`. No signal callback registration, no binary conversion, no DOM polyfills.
- **`packages/client/src/language/worker-executor.ts`** (259 lines): Runs language bundles in a Web Worker. The Worker context strips Holochain access — zome calls would need to be proxied back to the main thread.

### What needs to change

1. Extend the delegate to support `registerSignalCallbacksForApp` with cell_id-keyed callbacks
2. Implement a Worker ↔ main-thread message proxy for Holochain calls:
   - Worker sends `{ type: 'zome-call', cellId, zomeName, fnName, payload }` to main thread
   - Main thread calls the real conductor and sends response back
   - Signal routing: main thread receives signals, dispatches to Worker via `postMessage`
3. Add binary marker conversion (`__binary` → `Uint8Array`) in zome call response handling
4. Consider DOM polyfills for language bundles that include Svelte components (HTMLElement, document, customElements stubs)

**Files to modify:** `packages/core/src/holochain/delegate.ts`, `packages/client/src/language/worker-executor.ts`, `packages/client/src/holochain/ws-conductor.ts`

**Priority:** 🔴 CRITICAL — p-diff-sync languages need Holochain zome access to function.

---

## 3. Network Seed Handling (CRITICAL)

### What the reference does

When publishing a neighbourhood:

1. A link language template is cloned via `languageApplyTemplateAndPublish` with `templateData`
2. The `templateData` includes a `uid` that becomes the `networkSeed` parameter in `installApp`
3. The `networkSeed` ensures each neighbourhood gets its own unique Holochain DHT
4. In `holochain_service/mod.rs`, `install_app` passes `network_seed` to `InstallAppPayload`

### What ad4m-web has

- Neighbourhood publishing/joining exists in `packages/core/src/neighbourhood/manager.ts`
- Unclear if `networkSeed` from template data is passed through to `installApp`

### What needs to change

1. When installing a language that contains a Holochain DNA, extract the `uid`/`networkSeed` from the template data
2. Pass it to the conductor's `installApp` as the `network_seed` field
3. Ensure the same seed derivation as reference so the DNA hashes match (required for DHT membership)

**Files to modify:** `packages/core/src/neighbourhood/manager.ts`, `packages/core/src/holochain/delegate.ts`, `packages/client/src/holochain/ws-conductor.ts`

**Priority:** 🔴 CRITICAL — Wrong network seed = different DHT = no sync.

---

## 4. Bootstrap URLs (HIGH)

### What the reference does

Default network endpoints (from `rust-executor/src/config.rs` and `holochain_service/mod.rs`):

- Bootstrap URL: `http://bootstrap.ad4m.dev:4433`
- Signal URL: `ws://bootstrap.ad4m.dev:4433`
- Relay URL: `http://bootstrap.ad4m.dev:4433/relay`

These were recently changed from the old `perspect3vism` URLs to the new `ad4m.dev` domain.

### What ad4m-web has

- Bootstrap/signal URLs configured in `packages/client/src/holochain/ws-conductor.ts` — may still use old URLs or localhost defaults

### What needs to change

1. Update default bootstrap, signal, and relay URLs to match `bootstrap.ad4m.dev:4433`
2. Make them configurable (environment variable or constructor parameter)
3. Ensure the relay URL includes the `/relay` path

**Files to modify:** `packages/client/src/holochain/ws-conductor.ts`, any config/env handling

**Priority:** 🟡 HIGH — Wrong bootstrap URL = can't discover peers on the reference network.

---

## 5. Signal Handling (CRITICAL)

### What the reference does

In `language_bootstrap.js`:

1. Each language registers signal callbacks per `cell_id` via `registerSignalCallbacksForApp`
2. Signals are dispatched through `__handleHolochainSignal__` matching cell_id to callback
3. p-diff-sync uses signals for `HashBroadcast` — when received:
   - Record the peer's current revision hash
   - Trigger a pull loop to fetch new diffs
   - Apply diffs to local state
4. In multi-user mode, signals include `recipient_did` for routing

### What ad4m-web has

- `ws-conductor.ts` connects to the Holochain conductor WebSocket but signal handling is minimal
- No cell_id-keyed dispatch map
- No `HashBroadcast` signal processing

### What needs to change

1. Subscribe to conductor signals on the WebSocket connection
2. Build a cell_id → callback dispatch map (matching the reference's `__holochainSignalCallbacks__`)
3. Route signals to the appropriate language's callback
4. In the p-diff-sync adapter, handle `HashBroadcast` signals: record peer revision, trigger pull

**Files to modify:** `packages/client/src/holochain/ws-conductor.ts`, `packages/core/src/holochain/delegate.ts`, the new p-diff-sync adapter

**Priority:** 🔴 CRITICAL — Without signal handling, nodes won't know about peers' new commits; sync degrades to polling only.

---

## 6. New GraphQL Fields/Mutations (MEDIUM)

### What the reference added since spec v0.1.0

**New Queries:**

- `runtimeTlsDomain: String` — TLS domain from config (hosting)
- `runtimeReadiness: ReadinessStatus!` — subsystem readiness probe
- `runtimeHostingUserInfo: HostingUserInfo!` — user credit/status info
- `runtimeFriends: [String!]!` — list friends
- `runtimeHcAgentInfos: String!` — Holochain agent infos
- `runtimeGetNetworkMetrics: String!` — network metrics

**New Mutations:**

- `runtimeSetHotWalletAddress(address: String!): Boolean!`
- `runtimeRequestPayment(amount: String!): PaymentRequestResult!`
- `runtimeSetUserCredits(userDid: String!, credits: Float!): Boolean!`
- `runtimeSetUserFreeAccess(userDid: String!, freeAccess: Boolean!): Boolean!`

**New Types:**

- `ReadinessStatus { graphqlReady, holochainReady, languagesReady }`
- `HostingUserInfo { did, email, credits, freeAccess }`
- `PaymentRequestResult { success, paymentUrl, error }`

**New Capability Domain:**

- `runtime.hosting` with READ and UPDATE operations

### What ad4m-web has

- GraphQL schema defined locally — likely missing all of the above

### What needs to change

1. Add the new query/mutation resolvers to ad4m-web's GraphQL engine
2. For a non-hosted ad4m-web node, hosting queries can return sensible defaults (e.g., `runtimeReadiness` returning all-true, hosting queries returning empty/default)
3. The `runtime.hosting` capability domain should be recognized in capability checks

**Priority:** 🟠 MEDIUM — Most hosting features are only needed when ad4m-web runs as a hosted instance. `runtimeReadiness` is useful for all deployments.

---

## 7. MCP Server Support (LOW)

### What the reference does

Full MCP server at `/mcp/sse` with:

- SSE transport + JSON-RPC tool calling
- 30+ static tools (perspectives, subjects, flows, auth, profiles, children, subscriptions, languages, neighbourhoods)
- Dynamic SHACL-generated tools (`{class}_create`, `{class}_query`, etc.)
- Capability-scoped access

**Key files:** `~/Desktop/ad4m/rust-executor/src/mcp/` (server.rs, shacl.rs, tools/\*.rs)

### What ad4m-web has

- No MCP server

### What needs to change

If MCP support is desired:

1. Implement an MCP SSE endpoint
2. Map MCP tool calls to the same internal operations as GraphQL mutations/queries
3. Implement the SHACL-to-tool dynamic generation from perspective models
4. Reuse the same capability auth layer

**Priority:** 🟢 LOW — MCP is an AI integration layer, not required for node-to-node interop. Can be added later.

---

## 8. Language Bootstrap JS Context (MEDIUM)

### What the reference does

`language_bootstrap.js` provides a rich runtime context for language bundles:

- DOM polyfills (HTMLElement, document, customElements, window) for Svelte components
- `Buffer` polyfill from Node.js
- Binary marker conversion (`__binary` → `Uint8Array`)
- `LANGUAGE_CONTROLLER` global for registering signal handlers

### What ad4m-web has

- Worker executor loads language bundles but may lack these polyfills
- Browser environment provides real DOM, but Worker context does not

### What needs to change

1. In the Worker executor, add DOM stubs matching the reference (HTMLElement with shadowRoot, document with createElement/createTextNode, customElements.define, window = globalThis)
2. Ensure `Buffer` is available (may need a polyfill in Worker context)
3. Add `LANGUAGE_CONTROLLER.registerHolochainSignalHandler` bridge

**Files to modify:** `packages/client/src/language/worker-executor.ts`

**Priority:** 🟠 MEDIUM — Required for loading p-diff-sync and other Holochain-backed language bundles that include Svelte components.

---

## 9. Compute Credit Gating (LOW)

### What the reference does

- `check_compute_credits` before link mutations and AI operations
- `reserve_compute_credits` atomically before expensive operations
- Warn-and-continue pattern (operation succeeds even if credits depleted, but future calls fail)
- Per-user credit tracking in the `users` table

### What ad4m-web has

- No credit system

### What needs to change

Only if ad4m-web is used in hosted mode:

1. Add a credit balance tracker per user
2. Add pre-check hooks before link mutations
3. Add GraphQL resolvers for credit management mutations

**Priority:** 🟢 LOW — Only relevant for hosted multi-user deployments.

---

## Summary: Priority Order

| #   | Gap                           | Priority    | Effort |
| --- | ----------------------------- | ----------- | ------ |
| 1   | PerspectiveDiffSync adapter   | 🔴 CRITICAL | Large  |
| 2   | Holochain delegate in Worker  | 🔴 CRITICAL | Large  |
| 5   | Signal handling               | 🔴 CRITICAL | Medium |
| 3   | Network seed handling         | 🔴 CRITICAL | Small  |
| 4   | Bootstrap URLs                | 🟡 HIGH     | Small  |
| 8   | Language bootstrap JS context | 🟠 MEDIUM   | Small  |
| 6   | New GraphQL fields/mutations  | 🟠 MEDIUM   | Medium |
| 7   | MCP server support            | 🟢 LOW      | Large  |
| 9   | Compute credit gating         | 🟢 LOW      | Medium |

### Recommended implementation order

1. **Bootstrap URLs** (#4) — quick win, ensures peer discovery
2. **Network seed handling** (#3) — ensures correct DHT membership
3. **Holochain delegate in Worker** (#2) — enables zome calls from language bundles
4. **Signal handling** (#5) — enables real-time sync
5. **Language bootstrap JS context** (#8) — enables loading reference language bundles
6. **PerspectiveDiffSync adapter** (#1) — the big one: real sync with reference nodes
7. **New GraphQL fields** (#6) — completeness
8. **MCP** (#7) and **credits** (#9) — future work

### Important constraints reminder

- ad4m-web is **clean-room**: MUST NOT copy implementation code from reference, only use `@coasys/ad4m` type definitions
- `erasableSyntaxOnly` — no TS enums
- `noUnusedLocals`, `noUnusedParameters` enforced
- No `.ts` extensions in imports

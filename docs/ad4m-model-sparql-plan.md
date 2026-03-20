# Ad4mModel with SPARQL — Implementation Plan

## Context

The reference AD4M uses **SurrealDB** as its link query engine inside perspectives. Ad4mModel (the ORM layer in `@coasys/ad4m`) generates SurrealQL queries for finding, filtering, and hydrating model instances from the link graph.

ad4m-web already has **Oxigraph** (SPARQL/RDF triple store) running in WASM for link storage and SPARQL queries. The task is to implement the `PerspectiveProxy` query interface that Ad4mModel expects — but backed by SPARQL instead of SurrealQL.

## What Ad4mModel Needs

Ad4mModel interacts with the perspective through these methods on `PerspectiveProxy`:

| Method | Purpose | Current ad4m-web status |
| --- | --- | --- |
| `querySurrealDB(query)` | Execute SurrealQL, return rows | Placeholder (returns `[]`) |
| `infer(query)` | Execute Prolog, return results | Not implemented |
| `get(LinkQuery)` | Get links matching source/predicate/target | ✅ Implemented |
| `executeAction(actions, base, values, batchId)` | Run SHACL actions (addLink, removeLink, setSingleTarget, collectionSetter) | ✅ Implemented via ShaclEngine |
| `createSubject(className, base, initialValues, batchId)` | Create instance with constructor actions | Partially implemented |
| `removeSubject(instance, base, batchId)` | Delete instance with destructor actions | Partially implemented |
| `createExpression(content, language)` | Create expression via language adapter | ✅ Implemented |
| `createBatch()` / `commitBatch(batchId)` | Transaction batching | Not implemented |
| `add(link)` / `removeLinks(links)` | Direct link manipulation | ✅ Implemented |
| `stringOrTemplateObjectToSubjectClassName(class)` | Resolve class → SHACL class name | Not implemented |
| `ensureSDNASubjectClass(class)` | Register model's SHACL shape on perspective | Not implemented |

## Architecture

### Option A: Implement `querySurrealDB` as SPARQL translation (recommended)

Ad4mModel generates SurrealQL queries via `query-surreal.ts`. Rather than translating SurrealQL→SPARQL at runtime, we **replace the query backend** at the Ad4mModel level:

1. **New module: `query-sparql.ts`** — parallel to `query-surreal.ts`, generates SPARQL queries from the same `Query` object
2. **New method: `queryToSPARQL()`** on Ad4mModel — parallel to `queryToSurrealQL()`
3. **New method: `instancesFromSPARQLResult()`** — parallel to `instancesFromSurrealResult()`
4. **`perspectiveQuerySPARQL`** GraphQL resolver — executes SPARQL against Oxigraph
5. Ad4mModel's `findAll`/`findAllAndCount`/`count`/`paginate` call the SPARQL path when `useSPARQL: true` (or as default in ad4m-web)

### Option B: SurrealQL → SPARQL runtime translator

Intercept `querySurrealDB()` calls and translate SurrealQL to SPARQL. Fragile — SurrealQL's graph traversal syntax (`->link[WHERE ...]`) has no clean SPARQL equivalent.

**Decision: Option A.** Clean, testable, no translation layer.

## Data Model Mapping

### Links as RDF Triples

Each AD4M link is already a triple: `(source, predicate, target)`. In Oxigraph:

```sparql
# A link: { source: "expr:abc", predicate: "recipe://name", target: "literal://string:Pasta" }
# Stored as:
<expr:abc> <recipe://name> <literal://string:Pasta> .

# With metadata (reification via RDF-star or named graphs):
<<expr:abc> <recipe://name> <literal://string:Pasta>>
    <ad4m://author> <did:key:z6Mk...> ;
    <ad4m://timestamp> "2026-03-20T12:00:00Z"^^xsd:dateTime .
```

### RDF-star vs Named Graphs

**RDF-star** (recommended) — Oxigraph supports it natively. Each link's metadata (author, timestamp) is expressed as assertions about the triple itself:

```sparql
# Query: find all links from a source with a predicate
SELECT ?target ?author ?timestamp WHERE {
  <<?source ?predicate ?target>> <ad4m://author> ?author ;
                                  <ad4m://timestamp> ?timestamp .
}
```

**Alternative: Named graphs** — each link gets its own graph. More verbose, harder to query.

## Implementation Phases

### Phase 1: SPARQL Query Builder (`query-sparql.ts`)

**New file:** `packages/core/src/model/query-sparql.ts`

Translate `Query` objects into SPARQL:

```typescript
export function buildSPARQLQuery(
  metadata: ModelMetadata,
  allRelationsMetadata: Record<string, RelationMetadataEntry>,
  query: Query,
  modelClass: any
): string
```

#### Query Mapping

| SurrealQL Concept | SPARQL Equivalent |
| --- | --- |
| `FROM node WHERE count(->link[WHERE pred = X]) > 0` | `?base <X> ?val .` (existence via basic graph pattern) |
| `->link[WHERE pred = X AND out.uri = Y]` | `?base <X> <Y> .` |
| `<-link[WHERE pred = X AND in.uri = Y]` (belongsTo) | `<Y> <X> ?base .` |
| `fn::parse_literal(out.uri)` | SPARQL `BIND` + string extraction from `literal://` URIs |
| `GROUP BY source` | Not needed — SPARQL naturally returns per-binding rows |
| `LIMIT / OFFSET` | `LIMIT` / `OFFSET` in SPARQL |
| `ORDER BY` | `ORDER BY` in SPARQL |
| Property equality: `out.uri = "value"` | `FILTER(?val = "value")` or direct pattern `?base <pred> "value"` |
| NOT conditions | `FILTER NOT EXISTS { ... }` |
| Comparison (gt, lt, etc.) | `FILTER(?val > X)` |
| `CONTAINS` | `FILTER(CONTAINS(?val, X))` |

#### Instance Discovery (conformance check)

SurrealQL uses required-predicate existence checks. In SPARQL:

```sparql
# Find all instances of Recipe (has required property recipe://name)
SELECT DISTINCT ?base WHERE {
  ?base <recipe://name> ?name .
  # Additional required predicates...
}
```

#### Example Generated Query

For `Recipe.findAll(perspective, { where: { name: "Pasta" }, limit: 10, order: { createdAt: "DESC" } })`:

```sparql
SELECT ?base ?predicate ?target ?author ?timestamp WHERE {
  # Conformance: must have required property
  ?base <recipe://name> ?anyName .

  # WHERE filter
  ?base <recipe://name> "literal://string:Pasta" .

  # Fetch all outgoing links for hydration
  ?base ?predicate ?target .

  # Metadata via RDF-star
  <<?base ?predicate ?target>> <ad4m://author> ?author ;
                                <ad4m://timestamp> ?timestamp .
}
ORDER BY DESC(?timestamp)
LIMIT 10
```

### Phase 2: Link Storage as RDF

**File:** `packages/core/src/linkstore/` (existing)

The link store needs to write links as RDF triples with RDF-star metadata. Currently it stores `LinkExpression` objects. Changes:

1. **`addLink()`** — also inserts RDF triple + metadata into Oxigraph
2. **`removeLink()`** — also removes from Oxigraph
3. **`queryLinks()`** — can optionally use SPARQL for complex queries
4. New: **`querySPARQL(query: string): Promise<any[]>`** — raw SPARQL execution

The Oxigraph store already exists in `packages/client/src/linkstore/` (browser) — it needs the RDF-star insert/query logic.

### Phase 3: Result Hydration (`instancesFromSPARQLResult`)

SPARQL results come as bindings `[{ base, predicate, target, author, timestamp }, ...]`. Group by `?base`, then reuse the existing `hydrateFromLinks()` from `hydration.ts` (it already accepts a links array).

```typescript
export async function instancesFromSPARQLResult<T extends Ad4mModel>(
  perspective: PerspectiveProxy,
  query: Query,
  bindings: SPARQLBinding[]
): Promise<ResultsWithTotalCount<T>>
```

### Phase 4: PerspectiveProxy Integration

Add to the ad4m-web `PerspectiveProxy` equivalent (or the GraphQL schema):

1. `perspectiveQuerySPARQL(uuid, query)` — GraphQL resolver executing SPARQL
2. Wire Ad4mModel's `findAll` etc. to use the SPARQL path by default

### Phase 5: Batch Operations

Implement `createBatch()` / `commitBatch()`:

- Buffer link additions/removals in memory
- On commit, apply all at once to Oxigraph + link store
- This already partially exists in the SHACL engine's `executeAction`

### Phase 6: Model Registration (`ensureSDNASubjectClass`)

When `Ad4mModel.register(perspective)` is called:

1. Call `generateSHACL()` on the model class (already implemented by `@Model` decorator)
2. Store the SHACL shape as links in the perspective (the shape IS links — `rdf://type → ad4m://SubjectClass`, property shapes, etc.)
3. `ShaclEngine.loadShapes()` can then parse these for instance creation/validation

### Phase 7: `stringOrTemplateObjectToSubjectClassName`

Resolve a model class constructor → its `@Model` name. This is straightforward:

```typescript
async stringOrTemplateObjectToSubjectClassName(classOrString: any): Promise<string> {
  if (typeof classOrString === 'string') return classOrString
  // Check if it's an Ad4mModel subclass with prototype.className
  if (classOrString?.prototype?.className) return classOrString.prototype.className
  // Check static generateSDNA
  const sdna = classOrString?.generateSDNA?.()
  if (sdna?.name) return sdna.name
  throw new Error('Cannot resolve subject class name')
}
```

## Literal Parsing

Ad4mModel stores property values as `literal://` URIs. The SPARQL layer needs:

```typescript
// Extract value from literal://string:Hello → "Hello"
// Extract value from literal://number:42 → 42
// Used in FILTER expressions and result hydration
function sparqlLiteralExtract(varName: string): string {
  return `BIND(
    IF(STRSTARTS(STR(${varName}), "literal://string:"),
       SUBSTR(STR(${varName}), 19),
       IF(STRSTARTS(STR(${varName}), "literal://number:"),
          xsd:decimal(SUBSTR(STR(${varName}), 18)),
          STR(${varName})
       )
    ) AS ${varName}_parsed
  )`
}
```

## What We Can Skip

1. **Prolog** — Ad4mModel has both Prolog and SurrealQL paths. We implement a third (SPARQL) path and use that. No Prolog engine needed.
2. **SurrealDB** — Not needed at all. The `querySurrealDB` placeholder can remain (or be removed).
3. **`query-prolog.ts`** — Not ported. Ad4mModel's Prolog query builders are irrelevant.
4. **Subscriptions** — Ad4mModel subscriptions (`ModelQueryBuilder.subscribe()`) use `perspectiveLinksSubscription` + re-query. This already works with our PubSub layer — just needs the SPARQL query path for the re-query.

## File Plan

| File                                           | Action     | Description                                            |
| ---------------------------------------------- | ---------- | ------------------------------------------------------ |
| `packages/core/src/model/query-sparql.ts`      | **New**    | SPARQL query builder from `Query` objects              |
| `packages/core/src/model/sparql-utils.ts`      | **New**    | Literal parsing, URI escaping, binding helpers         |
| `packages/core/src/model/Ad4mModel.ts`         | **Port**   | Full Ad4mModel class (modified to use SPARQL)          |
| `packages/core/src/model/ModelQueryBuilder.ts` | **Port**   | Fluent query builder                                   |
| `packages/core/src/model/decorators.ts`        | **Port**   | `@Model`, `@Property`, `@HasMany`, etc.                |
| `packages/core/src/model/hydration.ts`         | **Port**   | Instance hydration from link data                      |
| `packages/core/src/model/types.ts`             | **Port**   | Query/metadata type definitions                        |
| `packages/core/src/model/json-schema.ts`       | **Port**   | `fromJSONSchema()` support                             |
| `packages/core/src/model/query-common.ts`      | **Port**   | Shared query utilities                                 |
| `packages/core/src/model/sdna.ts`              | **Port**   | SDNA generation                                        |
| `packages/core/src/model/shacl-gen.ts`         | **Port**   | SHACL shape generation                                 |
| `packages/core/src/model/index.ts`             | **Port**   | Module exports                                         |
| `packages/core/src/linkstore/sparql-store.ts`  | **New**    | SPARQL-backed link query execution                     |
| `packages/core/src/perspective/manager.ts`     | **Modify** | Add SPARQL query, batch, subject class methods         |
| `packages/core/src/graphql/schema.ts`          | **Modify** | Wire `perspectiveQuerySPARQL`, subject class resolvers |
| `packages/core/src/__tests__/model/`           | **New**    | Full test suite for Ad4mModel + SPARQL                 |

## Dependency Analysis

From `@coasys/ad4m/model/`:

| File | Lines | External deps | Portability |
| --- | --- | --- | --- |
| `Ad4mModel.ts` | 1,982 | PerspectiveProxy, decorators, hydration | **Heavy** — references SurrealDB throughout |
| `decorators.ts` | 1,025 | WeakMap metadata, reflect-metadata? | **Clean** — pure metadata, no DB deps |
| `hydration.ts` | 796 | PerspectiveProxy, decorators | **Clean** — operates on link arrays |
| `ModelQueryBuilder.ts` | 617 | Ad4mModel, PerspectiveProxy | **Clean** — delegates to Ad4mModel static methods |
| `query-surreal.ts` | 280 | Metadata types, utils | **Replace** with `query-sparql.ts` |
| `surreal-utils.ts` | 147 | None | **Replace** with `sparql-utils.ts` |
| `json-schema.ts` | 424 | decorators, Ad4mModel | **Clean** — pure schema parsing |
| `types.ts` | 182 | None | **Direct port** |
| `query-common.ts` | 48 | decorators | **Direct port** |
| `sdna.ts` | 170 | decorators | **Port** (may simplify — used for Prolog SDNA) |
| `shacl-gen.ts` | 292 | decorators | **Direct port** |

Total: ~5,963 lines to port/adapt, ~430 lines to replace with SPARQL equivalents.

## Estimated Scope

- **Core query builder** (`query-sparql.ts`): ~300 lines
- **SPARQL utilities**: ~100 lines
- **Ad4mModel port**: ~1,500 lines (remove SurrealDB/Prolog paths, add SPARQL)
- **Supporting modules port**: ~2,500 lines (mostly direct copy with import fixes)
- **Link store SPARQL layer**: ~200 lines
- **GraphQL wiring**: ~100 lines
- **Batch operations**: ~150 lines
- **Tests**: ~1,500 lines
- **Total**: ~6,350 lines

## Open Questions

1. **RDF-star support in Oxigraph WASM** — Needs verification. If not supported, fall back to named graphs or quad-based reification.
2. **Literal URI handling in SPARQL** — AD4M uses `literal://string:X` as URIs. In SPARQL these are IRIs, not RDF literals. String manipulation via `SUBSTR`/`STRSTARTS` works but is verbose. Alternative: store a parallel `xsd:string` literal for each link target.
3. **PerspectiveProxy compatibility** — Ad4mModel is tightly coupled to `PerspectiveProxy` from `@coasys/ad4m`. We need to either: (a) implement the same interface, or (b) adapt Ad4mModel to use our own perspective interface. Option (b) is cleaner for ad4m-web.
4. **Batch semantics** — Does `createBatch/commitBatch` need true ACID? Or is buffered-apply sufficient? (Buffered-apply is likely fine for single-user browser contexts.)

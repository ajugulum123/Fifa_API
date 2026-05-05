# GraphQL Schema Design — FIFA Player Stats

## Dataset at a glance

| Fact | Value |
|------|-------|
| Source | `srcData/player_stats.csv` |
| Players | 5,682 |
| Columns | 41 (name, country, height, weight, age, club, 34 skill ints, value) |
| Countries | 135 |
| Clubs | 684 |
| Ages | 17 – 41 |

---

## Design decision log

### 1. Why GraphQL over REST here?

With 34+ stats per player a REST endpoint always over-fetches — a caller wanting
only `name`, `club`, and `finishing` gets all 41 columns. GraphQL lets each client
describe exactly the fields it needs, reducing payload size and making the contract
explicit in the query itself.

---

### 2. Skill stats: grouped value-objects, not a flat 34-field type

The 34 skill attributes were split into four **value-object types** — not separate
entities:

| Type | Fields | Notes |
|------|--------|-------|
| `TechnicalSkills` | 14 fields | Attacking, passing, set-piece |
| `DefensiveSkills` | 5 fields | `marking` nullable (~158 GK nulls in source) |
| `PhysicalAttributes` | 10 fields | Speed, strength, mental |
| `GoalkeeperSkills` | 5 fields | Low values for outfielders |

**Why value-objects and not separate entities?**
- They have no identity of their own — they only exist attached to a `Player`.
- No top-level query exposes them, so there is no risk of an N+1 resolver chain.
- A caller who only needs goalkeeper stats fetches `player { goalkeeper { ... } }`
  without touching the other 29 fields.

---

### 3. Avoiding nested queries and circular references

The most common source of runaway depth is bidirectional edges:

```
# AVOIDED — this creates a cycle
type Player {
  club: Club!        # Player → Club
}
type Club {
  players: [Player!] # Club → Player → Club → Player → ...
}
```

**Decision:** `ClubSummary` deliberately does **not** expose a `players` field.
To get players for a club, callers use:

```graphql
query {
  players(filter: { club: "FC Barcelona" }) {
    edges { node { name } }
  }
}
```

This keeps the object graph a DAG (directed acyclic graph). Max reachable depth
from any query root:

```
Query (1)
  └─ players (2)
       └─ edges.node : Player (3)
            └─ technical : TechnicalSkills (4)
                 └─ ballControl : Int  ← scalar, depth stops (5)
```

The server should enforce `graphql-depth-limit` at **6** to give a safe margin.

---

### 4. Query depth limits — implementation note

Install and apply at server startup (Node / Apollo example):

```ts
import depthLimit from 'graphql-depth-limit';

const server = new ApolloServer({
  schema,
  validationRules: [depthLimit(6)],
});
```

A depth of 6 covers the deepest legitimate path:
`Query → Connection → edges → node → SkillGroup → scalar`

Any query exceeding 6 levels is rejected before execution.

---

### 5. Pagination — Relay cursor connections

Plain `[Player!]!` lists are avoided everywhere because with 5,682 rows an
unbounded query would return megabytes. Every list is wrapped in a `Connection`
type following the Relay spec:

```graphql
type PlayerConnection {
  edges:    [PlayerEdge!]!
  pageInfo: PageInfo!   # hasNextPage, totalCount, start/endCursor
}
```

The `PaginationInput` uses `first`/`after` for forward pagination. The server
enforces a max page size of **100**.

---

### 6. Meaningful field names

Raw CSV names were renamed to be self-documenting:

| CSV column | Schema field | Why |
|------------|-------------|-----|
| `player` | `name` | "player" is the type name, not a field label |
| `height` | `heightCm` | Unit is now explicit |
| `weight` | `weightKg` | Unit is now explicit |
| `att_position` | `attackingPosition` | No abbreviations |
| `fk_acc` | `freeKickAccuracy` | No abbreviations |
| `gk_positioning` | `goalkeeper.positioning` | Namespaced under `GoalkeeperSkills` |
| `value` | `marketValue` (Currency scalar) | `value` is too generic; the type makes the unit clear |

---

### 7. Input types for mutations

All multi-field mutations accept a single **Input type** — never loose argument
lists — so:
- Additions of new fields are non-breaking changes to the input type.
- Clients can store, validate, and reuse the input object.
- `CreatePlayerInput` makes every skill required (complete records on creation).
- `UpdatePlayerInput` makes every field optional (partial patch semantics).

---

### 8. Payload wrappers with in-band errors

Mutations return `PlayerPayload`, not a raw `Player`. This follows the
"mutation payload" pattern:

```graphql
type PlayerPayload {
  player: Player        # null on failure
  errors: [UserError!]! # empty on success
}
```

This means:
- Callers always get HTTP 200.
- Validation errors (e.g. `age` out of range) are surfaced as structured
  `UserError` objects with a `field` path — not thrown as top-level GraphQL errors.
- The response shape is consistent and easy to handle in any client.

---

### 9. `overallRating` — computed field

The CSV has no single "overall" column. `overallRating` is a server-computed
aggregate (e.g. weighted average across `technical`, `defensive`, and `physical`
skill groups). This gives callers a sorting/filtering handle without exposing the
raw computation formula in the schema.

---

## File structure

```
graphql/
├── schema.graphql       # single-file SDL schema (source of truth)
└── SCHEMA_DESIGN.md     # this document
```

For implementation, a suggested layout with a Node/TypeScript server:

```
graphql/
├── schema.graphql
├── resolvers/
│   ├── query/
│   │   ├── player.ts
│   │   ├── players.ts
│   │   ├── topPlayers.ts
│   │   ├── clubs.ts
│   │   └── countries.ts
│   ├── mutation/
│   │   ├── createPlayer.ts
│   │   ├── updatePlayer.ts
│   │   └── deletePlayer.ts
│   └── Player/          # field-level resolvers for computed fields
│       └── overallRating.ts
├── loaders/
│   └── playerLoader.ts  # DataLoader for batching
└── types/
    └── generated.ts     # codegen output from schema.graphql
```

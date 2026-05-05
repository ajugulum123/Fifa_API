# FIFA Player Stats — GraphQL API

A secure, production-style GraphQL API serving stats for **5,682 FIFA players** loaded from a CSV dataset. Built with Node.js, TypeScript, and Apollo Server, the project demonstrates a complete end-to-end design — from schema modelling to HTTPS, authentication, and role-based access control — over a single endpoint.

> **Repo:** [github.com/ajugulum123/Fifa_API](https://github.com/ajugulum123/Fifa_API)

---

## Goal

Deliver a GraphQL service that is **more efficient than REST** (one endpoint, no over-fetching, no under-fetching) while staying production-ready: secure transport, strong authentication, predictable error handling, and clear separation between read and write access.

The schema, transport, auth, and access-control layers are intentionally over-engineered relative to the dataset size to serve as a teaching reference for how to structure a real GraphQL service.

---

## Capabilities

### GraphQL schema
- **Single endpoint** (`/graphql`) covering all reads and writes.
- **`Player` type** with grouped value objects for `technical`, `defensive`, `physical`, and `goalkeeper` skill stats — keeps the API ergonomic and prevents flat-attribute sprawl.
- **`Club` summary type** computed on the fly from the player set (player count, average age, average rating).
- **Computed `overallRating`** field aggregated server-side from skill groups.
- **Meaningful naming** (`country`, `heightCm`, `weightKg`, `marketValue`) — no abbreviations.
- **Strict input types** for all mutations.
- **No circular nesting** — `Club` doesn't expose a `players` field; use `Query.players(filter: { clubs: ["…"] })` instead.

### Filtering, sorting, pagination
- **Comprehensive filters:** countries (multi-value), clubs (multi-value), age range, height range, market-value range, plus per-skill filters under each value-object group.
- **Multi-field sorting:** pass `[{ field, direction }, …]` for tiebreakers; 39 sort fields covering all attributes.
- **Relay-style cursor pagination** (`first`/`after`, `last`/`before`) with `pageInfo` and `totalCount` on the connection.

### Security
- **HTTPS only** — TLS 1.2+ enforced, strong cipher suite, HTTP→HTTPS redirect.
- **Helmet** for HSTS, CSP, X-Frame-Options, and other defensive headers.
- **CORS** with configurable origin allow-list.
- **Rate limiting** (default 100 requests / 60s per IP) returning a structured `TOO_MANY_REQUESTS` payload.
- **Query depth limit** (default 6) to block abusive nested queries.
- **Production error masking** — internal stack traces never leak to clients.

### Authentication & Authorization
- **JWT-based auth** with both access tokens (15 min) and refresh tokens (7 days, single-use rotation).
- **bcrypt** password hashing (cost factor 12).
- **Constant-time username comparison** to prevent username-enumeration timing attacks.
- **Refresh token revocation set** — used or logged-out tokens cannot be replayed.
- **Two-role RBAC:**
  - `ADMIN` — full read + write
  - `USER` — read only (mutations return `FORBIDDEN`)

### Error handling
- **In-band errors** in every payload via `UserError` + `OperationMeta`, mapping to HTTP status code semantics (2xx, 3xx, 4xx, 5xx) without changing the actual HTTP status of the GraphQL response.
- **Consistent shape** across queries, mutations, and pagination so clients can write a single error handler.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript 5 |
| GraphQL server | Apollo Server 4 |
| HTTP framework | Express 4 |
| Auth | `jsonwebtoken` + `bcryptjs` |
| Security | `helmet`, `cors`, `express-rate-limit`, `graphql-depth-limit` |
| Data | In-memory `Map` loaded from CSV via `csv-parse` |

---

## Quick start

### 1. Install
```bash
git clone git@github.com:ajugulum123/Fifa_API.git
cd Fifa_API
npm install
```

### 2. Generate dev TLS certificates
```bash
npm run gen:certs
```

### 3. Configure environment
```bash
cp .env.example .env
# Open .env and set strong values for:
#   JWT_ACCESS_SECRET
#   JWT_REFRESH_SECRET
#   ADMIN_USERNAME / ADMIN_PASSWORD
```

Generate secure JWT secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Build & run
```bash
npm run build
npm start
```

You should see:
```
👤  Seeded admin user: "admin" (role: ADMIN)
Loading player data…
Loaded 5682 players.

✅  GraphQL API ready
   HTTPS : https://localhost:4443/graphql
   TLS   : TLSv1.2+ enforced
   Depth : queries > 6 levels rejected
   Rate  : 100 req / 60s per IP
```

### 5. Open Apollo Sandbox
Visit **https://localhost:4443/graphql** in your browser. Accept the self-signed certificate warning (expected in development), then explore the schema and run queries interactively.

For development with live reload:
```bash
npm run dev
```

---

## Project structure

```
FIFA_API/
├── docs/
│   ├── API.md                       # End-to-end API usage guide
│   └── SCHEMA_DESIGN.md             # Schema design rationale
├── graphql/
│   └── schema.graphql               # Source of truth for the GraphQL schema
├── dataset/
│   └── player_stats.csv             # Source dataset (5,682 rows × 41 cols)
├── src/
│   ├── server.ts                    # HTTPS + Apollo bootstrap
│   ├── auth/
│   │   ├── jwt.ts                   # Access/refresh token sign + verify
│   │   └── userStore.ts             # In-memory users + revocation set
│   ├── data/
│   │   └── loadPlayers.ts           # CSV → Player domain objects
│   ├── resolvers/
│   │   ├── index.ts                 # Composes the three resolver modules
│   │   ├── auth.resolvers.ts        # me, register, login, refreshToken, logout
│   │   ├── players.resolvers.ts     # player(s), topPlayers, create/update/delete
│   │   ├── clubs.resolvers.ts       # clubs, countries
│   │   └── helpers.ts               # Auth guards, token issuance, filter/sort/paginate
│   ├── types/
│   │   └── context.ts               # Shared GqlContext interface
│   └── utils/
│       └── meta.ts                  # OperationMeta + UserError builders
├── certs/                           # Dev TLS material (generated locally, not committed)
└── README.md                        # ← you are here
```

---

## Documentation map

| Doc | Read this when… |
|---|---|
| **[docs/API.md](./docs/API.md)** | You want to call the API — auth flow, example queries/mutations, error codes, env vars. |
| **[docs/SCHEMA_DESIGN.md](./docs/SCHEMA_DESIGN.md)** | You want to understand *why* the schema is shaped the way it is. |
| **[graphql/schema.graphql](./graphql/schema.graphql)** | You need the canonical schema definition. |

---

## License

MIT — see source files for details.

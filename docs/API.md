# FIFA GraphQL API — Usage Guide

Practical reference for calling the API: endpoint info, auth flow, example queries and mutations, error codes, and configuration.

> For the **why** behind the schema, see [`SCHEMA_DESIGN.md`](./SCHEMA_DESIGN.md).
> For the canonical types, see [`../graphql/schema.graphql`](../graphql/schema.graphql).

---

## Endpoint

| | |
|---|---|
| **GraphQL** | `https://localhost:4443/graphql` |
| **Health check** | `https://localhost:4443/health` |
| **HTTP→HTTPS redirect** | `http://localhost:4080` (308 redirect) |
| **Sandbox UI** | Open the GraphQL endpoint in a browser |

All requests use `POST` with `Content-Type: application/json`. Self-signed certificates in development cause a browser warning — accept it once.

---

## Authentication

### Roles

| Role | Read players/clubs | Mutate players | Create ADMIN users |
|---|:---:|:---:|:---:|
| `ADMIN` | ✅ | ✅ | ✅ |
| `USER` | ✅ | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` |

Anonymous (no token) requests can read public queries but get `UNAUTHORIZED` on protected mutations.

### Token model

| Token | Lifetime | Purpose | Storage |
|---|---|---|---|
| **Access** | 15 min (default) | Sent on every request as `Authorization: Bearer <token>` | Memory or session cookie |
| **Refresh** | 7 days (default) | Used once to get a new access + refresh token pair | HttpOnly cookie or secure storage — **never** localStorage |

Refresh tokens are **single-use**: every refresh rotates to a new token and immediately revokes the old one server-side. A replayed refresh token returns `UNAUTHORIZED`.

### Auth flow at a glance

```text
1. login(input)            → { accessToken, refreshToken, user }
2. (any request)           → header: Authorization: Bearer <accessToken>
3. accessToken expires     → refreshToken(token: <refreshToken>) → new pair
4. logout(refreshToken)    → server revokes the refresh token
```

---

## Example operations

> Tip: in Apollo Sandbox, click the **Schema** icon (left sidebar) to autocomplete every field.

### Login (mutation)

```graphql
mutation {
  login(input: { username: "admin", password: "ChangeMe123!" }) {
    tokenPair {
      accessToken
      refreshToken
      accessTokenExpiresIn
      refreshTokenExpiresIn
    }
    user { id username role }
    errors { message code }
    meta   { httpStatus code statusMessage }
  }
}
```

### Register a `USER`

```graphql
mutation {
  register(input: { username: "alice", password: "Alice123!" }) {
    user { username role }
    tokenPair { accessToken refreshToken }
    meta { httpStatus code }
  }
}
```

### Identify the caller

```graphql
# Headers: Authorization: Bearer <accessToken>
query {
  me { user { id username role } meta { httpStatus code } }
}
```

### Refresh tokens

```graphql
mutation {
  refreshToken(token: "<your_refresh_token>") {
    tokenPair { accessToken refreshToken }
    meta { httpStatus code }
  }
}
```

### Logout

```graphql
mutation {
  logout(refreshToken: "<your_refresh_token>") {
    success
    meta { httpStatus code }
  }
}
```

---

## Querying players

### Top 5 Brazilian players by overall rating

```graphql
query {
  players(
    filter: { countries: ["Brazil"] }
    sort:   [{ field: OVERALL_RATING, direction: DESC }]
    pagination: { first: 5 }
  ) {
    edges {
      cursor
      node {
        id
        name
        club
        age
        overallRating
        technical { finishing dribbling shortPassing }
        physical  { sprintSpeed stamina }
      }
    }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}
```

### Pagination — fetch the next page

```graphql
query {
  players(pagination: { first: 5, after: "<endCursor from previous response>" }) {
    edges { cursor node { name overallRating } }
    pageInfo { hasNextPage endCursor }
  }
}
```

### Range filters and per-skill filters

```graphql
query {
  players(
    filter: {
      age:        { min: 21, max: 28 }
      heightCm:   { min: 180 }
      marketValue:{ min: 5000000 }
      technical:  { finishing: { min: 80 } }
    }
    sort:       [{ field: MARKET_VALUE, direction: DESC }]
    pagination: { first: 10 }
  ) {
    edges { node { name club marketValue overallRating } }
    totalCount
  }
}
```

### Single player by ID

```graphql
query {
  player(id: "abc-123") {
    player { name club overallRating }
    errors { message code }
    meta   { httpStatus code }
  }
}
```

### Top players in a skill category

```graphql
query {
  topPlayers(
    category: TECHNICAL
    limit:    10
    filter:   { countries: ["Argentina"] }
  ) {
    name
    club
    overallRating
    technical { finishing dribbling }
  }
}
```

### Clubs

```graphql
query {
  clubs(
    filter: { country: "Spain" }
    sort:   [{ field: AVERAGE_OVERALL_RATING, direction: DESC }]
    pagination: { first: 10 }
  ) {
    edges {
      node {
        name
        country
        playerCount
        averageAge
        averageOverallRating
      }
    }
    totalCount
  }
}
```

### Countries

```graphql
query {
  countries
}
```

---

## Mutating players (ADMIN only)

### Create

```graphql
mutation {
  createPlayer(input: {
    name: "Test Player"
    age:  25
    country: "Brazil"
    club:    "Chelsea"
    heightCm: 180
    weightKg: 75
    marketValue: 1000000
    technical: { /* full skill object — see schema for fields */ }
    defensive: { /* … */ }
    physical:  { /* … */ }
    goalkeeper:{ /* … */ }
  }) {
    player { id name overallRating }
    errors { message code field }
    meta   { httpStatus code }
  }
}
```

### Update (partial)

```graphql
mutation {
  updatePlayer(
    id: "abc-123"
    input: { age: 26, club: "Real Madrid" }
  ) {
    player { id age club }
    errors { message code field }
    meta   { httpStatus code }
  }
}
```

### Delete

```graphql
mutation {
  deletePlayer(id: "abc-123") {
    deletedPlayerId
    errors { message code }
    meta   { httpStatus code }
  }
}
```

---

## Error handling

Every response includes a `meta` object with HTTP-status semantics in-band:

```json
{
  "data": {
    "deletePlayer": {
      "deletedPlayerId": null,
      "errors": [
        { "message": "Player 'xyz' not found.", "code": "NOT_FOUND", "category": "CLIENT_ERROR" }
      ],
      "meta": { "httpStatus": 404, "code": "NOT_FOUND", "statusMessage": "Not Found" }
    }
  }
}
```

### Code reference

| Category | Code | HTTP |
|---|---|:---:|
| **2xx — Success** | `OK` | 200 |
| | `CREATED` | 201 |
| | `ACCEPTED` | 202 |
| | `NO_CONTENT` | 204 |
| **3xx — Redirection** | `MOVED_PERMANENTLY` | 301 |
| | `FOUND` | 302 |
| | `SEE_OTHER` | 303 |
| | `NOT_MODIFIED` | 304 |
| **4xx — Client error** | `BAD_REQUEST` | 400 |
| | `UNAUTHORIZED` | 401 |
| | `FORBIDDEN` | 403 |
| | `NOT_FOUND` | 404 |
| | `CONFLICT` | 409 |
| | `GONE` | 410 |
| | `UNPROCESSABLE_ENTITY` | 422 |
| | `TOO_MANY_REQUESTS` | 429 |
| **5xx — Server error** | `INTERNAL_SERVER_ERROR` | 500 |
| | `NOT_IMPLEMENTED` | 501 |
| | `BAD_GATEWAY` | 502 |
| | `SERVICE_UNAVAILABLE` | 503 |
| | `GATEWAY_TIMEOUT` | 504 |

Use `meta.httpStatus` for branching and `errors[].field` to surface form-level validation messages.

---

## Configuration

All knobs live in `.env` (see `.env.example` for the template).

| Variable | Default | Notes |
|---|---|---|
| `HTTPS_PORT` | `4443` | Where the secure server listens |
| `HTTP_PORT` | `4080` | Where the redirect server listens |
| `TLS_KEY_PATH` | `./certs/server.key` | Required at startup |
| `TLS_CERT_PATH` | `./certs/server.crt` | Required at startup |
| `CORS_ORIGINS` | `*` | Comma-separated origin allow-list in production |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window length for rate limiting |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `GRAPHQL_DEPTH_LIMIT` | `6` | Reject queries deeper than this |
| `GRAPHQL_INTROSPECTION` | `true` | Disable in production |
| `JWT_ACCESS_SECRET` | — | **Required.** 64+ random hex bytes |
| `JWT_REFRESH_SECRET` | — | **Required.** Different from access secret |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | ms-format string |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | ms-format string |
| `ADMIN_USERNAME` | `admin` | Seed user created at startup |
| `ADMIN_PASSWORD` | `ChangeMe123!` | **Change before first run** |
| `CSV_PATH` | `./srcData/player_stats.csv` | Dataset source |

### Generating strong secrets

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## curl recipes

### Login and capture the access token

```bash
ACCESS=$(curl -sk -X POST https://localhost:4443/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { login(input:{username:\"admin\",password:\"ChangeMe123!\"}){ tokenPair { accessToken } } }"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['login']['tokenPair']['accessToken'])")
```

### Authenticated query

```bash
curl -sk -X POST https://localhost:4443/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS" \
  -d '{"query":"{ me { user { username role } } }"}'
```

### Health check

```bash
curl -sk https://localhost:4443/health
# → {"status":"ok"}
```

---

## Production checklist

Before exposing the service publicly:

- [ ] Replace self-signed certs with a CA-issued certificate (e.g. Let's Encrypt).
- [ ] Set strong, unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.
- [ ] Change `ADMIN_PASSWORD` from the default.
- [ ] Lock `CORS_ORIGINS` to specific origins.
- [ ] Set `GRAPHQL_INTROSPECTION=false` (Sandbox will be disabled).
- [ ] Replace the in-memory user store with a real database.
- [ ] Replace the in-memory revocation set with Redis (or equivalent).
- [ ] Move CSV ingestion to a persistent store if write workloads are added.
- [ ] Add request logging + monitoring + alerting.

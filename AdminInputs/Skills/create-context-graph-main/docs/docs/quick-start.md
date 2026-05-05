---
sidebar_position: 2
title: Quick Start
slug: /quick-start
---

# Quick Start

Get a context graph app running in under 5 minutes.

## Prerequisites

- **Python 3.11+** -- verify with `python3 --version`
- **Node.js 18+** -- verify with `node --version` (required for the Next.js frontend)
- **Neo4j** -- one of: [Neo4j Aura](https://console.neo4j.io) (free cloud), Docker, or `@johnymontana/neo4j-local`
- **Anthropic API key** -- for the AI agent ([get one here](https://console.anthropic.com))

## 1. Scaffold (~30 seconds)

```bash
uvx create-context-graph my-app \
  --domain healthcare \
  --framework pydanticai \
  --demo-data
```

This generates a complete project in `./my-app/` with a FastAPI backend, Next.js frontend, and sample healthcare data.

You should see output like:

```
✓ Created project: my-app
  Domain: healthcare
  Framework: pydanticai
  Demo data: included
```

### With MCP Server for Claude Desktop

```bash
uvx create-context-graph my-app \
  --domain healthcare \
  --framework pydanticai \
  --demo-data \
  --with-mcp
```

This generates an MCP server configuration alongside the web app. After setup, copy `mcp/claude_desktop_config.json` into your Claude Desktop config to query the knowledge graph directly from Claude.

:::tip
Use `--demo` instead of `--demo-data` to also reset the database and ingest data in one step (requires Neo4j connection).
:::

## 2. Set Up Neo4j (~1-2 minutes)

**Option A: Neo4j Aura (easiest)**

1. Create a free instance at [console.neo4j.io](https://console.neo4j.io)
2. Download the `.env` credentials file
3. Pass it during scaffold: `--neo4j-aura-env path/to/Neo4j-credentials.env`

**Option B: Docker**

```bash
cd my-app && docker compose up -d neo4j
```

**Option C: neo4j-local**

```bash
npx @johnymontana/neo4j-local
```

## 3. Configure Environment (~30 seconds)

```bash
cd my-app
cp .env.example .env
# Edit .env with your Neo4j credentials and Anthropic API key
```

## 4. Install & Seed Data (~1-2 minutes)

```bash
cd backend
uv venv && uv pip install -e ".[dev]"
make seed
```

You should see output like:

```
Creating schema constraints...
Loading fixture data...
✓ Seeded 85 entities, 180 relationships, 25 documents, 4 decision traces
```

## 5. Start the App (~30 seconds)

In two terminals:

```bash
# Terminal 1: Backend
cd my-app/backend && make dev

# Terminal 2: Frontend
cd my-app/frontend && npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start chatting with your healthcare knowledge graph.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `python3: command not found` | Install Python 3.11+ from [python.org](https://www.python.org/downloads/) or via your package manager |
| `node: command not found` | Install Node.js 18+ from [nodejs.org](https://nodejs.org/) |
| `make seed` fails with connection error | Ensure Neo4j is running and `.env` credentials are correct. Check with `make test-connection` |
| Port 8000 or 3000 already in use | Stop the other process or change the port in `.env` (`BACKEND_PORT`) or `frontend/next.config.ts` |
| `ANTHROPIC_API_KEY not set` | Add your key to `.env`: `ANTHROPIC_API_KEY=sk-ant-...` |
| Neo4j connection timeout | Wait a few seconds after starting Neo4j. Aura instances may take 30-60s to become available |

## What's Next?

- [Full tutorial](/docs/tutorials/first-context-graph-app) -- detailed walkthrough with all options
- [CLI reference](/docs/reference/cli-options) -- all available flags
- [Domain catalog](/docs/reference/domain-catalog) -- browse all 22 built-in domains
- [Switch frameworks](/docs/how-to/switch-frameworks) -- try different AI agent frameworks

# Changelog

## v0.9.0 — Claude Code Connector, Google Workspace & Security (2026-04-02)

### New Connectors
- **Claude Code connector** — Reads local session JSONL files from `~/.claude/projects/` with no authentication required. Parses user/assistant messages, tool_use/tool_result blocks, and progress entries. Extracts 7 entity types (Project, Session, Message, ToolCall, File, GitBranch, Error) with 10 relationship types. Includes heuristic **decision extraction** (user corrections, deliberation markers, error-resolution cycles, dependency changes) and **preference extraction** (explicit statements, package frequency). Secret redaction (API keys, tokens, passwords, connection strings) applied by default. 8 session intelligence agent tools injected via the renderer. 5 CLI flags (`--claude-code-scope`, `--claude-code-project`, `--claude-code-since`, `--claude-code-max-sessions`, `--claude-code-content`). Implementation split into `connectors/claude_code_connector.py` and `connectors/_claude_code/` subpackage (parser, redactor, decision_extractor, preference_extractor).
- **Google Workspace connector** — Imports from 6 Google APIs (Drive Files, Comments, Revisions, Activity, Calendar, Gmail) with OAuth2 authentication and dynamic scope building. Extracts **decision traces** from resolved comment threads in Google Docs (question, deliberation, resolution, participants). 10 decision-focused agent tools (`find_decisions`, `decision_context`, `who_decided`, `document_timeline`, `open_questions`, `meeting_decisions`, `knowledge_contributors`, `trace_decision_to_source`, `stale_documents`, `cross_reference`). Cross-connector linking detects Linear issue references in comment bodies, doc names, email subjects, and meeting descriptions. 9 CLI flags for scoping imports. Rate limiting (950 queries/100s with exponential backoff).

### Security
- **Replaced weak cryptographic hashing** — Switched from MD5/SHA1 to SHA-256 for content hashing in connectors (code scanning alerts #8 and #9).

### Bug Fixes
- **Session collision fix** — `Session.name` now uses `session_id` as the unique MERGE key to avoid cross-session collisions when importing Claude Code data.
- **Linear connector hardening** — Don't fail on blank Linear team key; improved robustness of Linear import with better error handling.

### Improvements
- Google Workspace connector template improvements and renderer integration
- Updated import_data.py template to handle new connectors
- **10 total SaaS connectors** (GitHub, Notion, Jira, Slack, Gmail, Google Calendar, Salesforce, Linear, Google Workspace, Claude Code)
- 955 passing tests (1,165 collected including slow/integration)

## v0.8.2 — Linear Connector (2026-04-02)

### New Features
- **Linear SaaS connector** — GraphQL-based connector with cursor-based pagination and rate limiting against `https://api.linear.app/graphql`. Maps 12 entity types (Issue, Project, Cycle, Team, Person, Label, WorkflowState, Comment, ProjectUpdate, ProjectMilestone, Initiative, Attachment) to the POLE+O entity model with 26 relationship types. Imports issue relations, threaded comments with resolution tracking, project updates with health status, milestones, initiatives, attachments, and Linear Docs. Issue history entries are transformed into decision traces capturing state transitions, assignment changes, and priority changes with actor attribution. Uses stdlib only (`urllib.request`).
- **Linear connector hardening** — Named constants, structured logging, URLError/JSONDecodeError/429 handling with retry, pagination safety limits (`MAX_PAGES`), null-safe field access, team key validation during `authenticate()`, incremental sync via `updated_after`.

### Bug Fixes
- **Fix traces silent failure** — Decision trace ingestion no longer silently fails on malformed data.

### Documentation
- New tutorial: `linear-context-graph.md` — end-to-end guide for importing Linear project data
- Updated CLI options reference and SaaS data import guide

## v0.8.1 — Schema Node Fix & Responsive Docs (2026-03-31)

### Bug Fixes
- **Click on schema node works again** — The `Button` component was added to the template for the "Ask about [entity]" feature but was never added to the `@chakra-ui/react` import. Clicking a schema node crashed the React component, preventing double-click expand from working.
- **Python 3.14 boundary** — Added `<3.14` to `requires-python` for forward compatibility.

### Improvements
- Improved responsive design for Docusaurus landing page

## v0.8.0 — Embedding Fix, Data Quality & Documentation (2026-03-28)

### Critical Fixes
- **neo4j-agent-memory no longer requires OpenAI API key** — Removed `[openai]` extra from the generated `pyproject.toml` dependency. Conversation memory now uses local `sentence-transformers` (`all-MiniLM-L6-v2`, 384 dims) by default. If `OPENAI_API_KEY` is set in the environment, automatically upgrades to OpenAI `text-embedding-3-small` (1536 dims). Added `sentence-transformers>=2.0` as an explicit dependency so local embeddings work out of the box with zero API keys.
- **openai-agents framework warns about missing API key** — CLI now displays a clear warning when `--framework openai-agents` is selected without `--openai-api-key`. The interactive wizard prompt text changes to indicate the key is "required" (not optional) for this framework.

### Data Quality
- **67 new entity name pools** — Added domain-appropriate names for every entity label across all 22 domains. `LABEL_NAMES` now has 118 entries (up from 51), eliminating all "Label 1" / "Label 2" fallback names. Covers agent-memory (Conversation, Memory, Session, ToolCall), digital-twin (Alert, Asset, Sensor, Reading, MaintenanceRecord, System), golf-sports (Round, Handicap, Hole, Course, Tournament), hospitality (Room, Reservation, Guest, Staff), oil-gas (Well, Equipment, Reservoir, Formation, Permit), personal-knowledge (JournalEntry, Note, Bookmark, Contact, Topic, Project), retail-ecommerce (Order, Product, Customer, Campaign, Category), vacation-industry (Booking, Package, Resort, Season), wildlife-management (Sighting, Camera, Habitat, Individual, Threat), conservation (Stakeholder), data-journalism (Correction), GIS (Boundary, Coordinate, Feature, Layer, MapProject, Survey), GenAI/LLM-Ops (Model, Prompt, Evaluation, Experiment), product-management (Epic, Metric, Objective, Release, Feedback, UserPersona), and scientific-research (Paper, Researcher, Grant, Institution).
- **Post-generation value clamping** — LLM-generated entities are now post-processed by `_validate_and_clamp()` in `generator.py`. Clamps 28 property types to domain-reasonable ranges (e.g., `price_per_night`: $30–$2,000; `duration_hours`: 0.25–24; `rating`: 1–5; `latitude`: -90–90). Also corrects taxonomy class mismatches (e.g., Bengal Tiger → "mammalia", not "aves").
- **Richer entity descriptions** — Added `_LOCATION_LABELS`, `_EVENT_LABELS`, and `_OBJECT_LABELS` sets (parallel to existing `_PERSON_LABELS`/`_ORGANIZATION_LABELS`) for POLE-type-aware descriptions. Added 7 label-specific description overrides for Medication, Permit, Sensor, Equipment, Paper, Model, and Species. Fallback descriptions no longer say "record tracked in the knowledge graph".
- **digital-twin fixture fix** — Fixed label casing in `digital-twin.json` (UPPERCASE → PascalCase) to match the domain YAML schema.
- **Domain-scoped entity MERGE keys** — Changed entity MERGE from `{name: $name}` to `{name: $name, domain: $domain}` in both `generate_data.py.j2` and `ingest.py`. Prevents constraint violation warnings when multiple domains share a single Neo4j instance.

### Framework Fixes
- **google-adk AttributeError guard** — Added `try/except AttributeError` around `runner.run_async()` in both `handle_message` and `handle_message_stream` to gracefully handle the `google-genai` SDK's `BaseApiClient` cleanup error when `_async_httpx_client` was never initialized.

### Documentation
- **Quick-Start page** — New `docs/quick-start.md` with a 5-step guide: scaffold → Neo4j setup → configure → seed → start.
- **use-neo4j-local guide** — New `docs/how-to/use-neo4j-local.md` covering `@johnymontana/neo4j-local` (npx), Neo4j Desktop, and Docker standalone with troubleshooting tips.
- **Domain catalog** — New `docs/reference/domain-catalog.md` listing all 22 domains with entity types, agent tool counts, sample questions, and scaffold commands. Auto-generated from domain YAML files.
- **Architecture diagram** — Mermaid flowchart added to the Introduction page showing CLI → Template Engine → Backend/Frontend → Neo4j data flow. Added `@docusaurus/theme-mermaid` for rendering.
- **switch-frameworks 404 fix** — Added `slug: switch-frameworks` to frontmatter so `/docs/how-to/switch-frameworks` resolves correctly.
- **Updated navigation** — Sidebar now includes quick-start, use-neo4j-local, and domain-catalog pages.

### Frontend UX
- **Larger status indicator** — Backend health dot enlarged from 8px to 12px with a text label ("Connected" / "Degraded" / "Offline").
- **Health check retry on initial load** — First page load now retries the health check 3 times with exponential backoff (1s, 2s, 4s) before showing "Offline". Prevents the transient "Internal Server Error" on initial Next.js compilation.
- **Improved empty graph state** — Empty knowledge graph panel now shows a link icon, "Your knowledge graph will appear here" heading, and actionable guidance text instead of a minimal "No graph data to display" message.

### Testing
- 691 passing tests (89 new), up from 602
- **New `tests/test_fixtures.py`** (88 tests) — Cross-validates all 22 domains:
  - Schema alignment: fixture entities have all required YAML properties
  - Agent tool property references: Cypher queries only reference properties that exist in schema or fixtures
  - Label coverage: fixtures include entities for every YAML-defined label
  - Data quality: numeric property values fall within reasonable ranges

## v0.7.0 — Documentation Site Redesign & CI (2026-03-28)

### New Features
- **Docusaurus landing page redesign** — New animated terminal hero section with domain-specific demo commands, improved hero animation timing, and terminal width/height fixes.
- **Mobile navigation** — Responsive nav bar with mobile layout improvements and design polish.
- **CI matrix job** — Full test suite (including domain × framework matrix, perf, and generated project tests) now runs in the `matrix` CI job on push to `main`.

### Documentation
- **4 new docs pages** — "Use Neo4j Aura", "Use Docker", "Why Context Graphs?", "Framework Comparison"
- Updated sidebars with all new pages

### Bug Fixes & Data Quality
- Bug fixes and data quality improvements across domains
- Updated docs and test coverage

## v0.6.1 — Stability, Data Quality & Tool Coverage (2026-03-28)

### Critical Bug Fixes
- **CrewAI dependency fix** — Changed `crewai>=0.1` to `crewai[anthropic]>=0.1` in framework dependencies. The crewai agent template uses `llm="anthropic/claude-sonnet-4-20250514"` which requires the anthropic extra. Without it, the generated project crashes on startup with `ImportError: Anthropic native provider not available`.
- **CLI non-interactive mode fix** — The CLI no longer requires a positional `PROJECT_NAME` argument when all flags (`--domain`, `--framework`) are provided. Auto-generates a slug like `healthcare-pydanticai-app`. Also added TTY detection with helpful error messages for CI/CD environments.

### Data Quality Improvements
- **Document Markdown rendering** — Static document content now uses Markdown headings (`##`) instead of RST-style `===`/`---` separators. The DocumentBrowser component renders content with ReactMarkdown.
- **Entity-derived document titles** — Document titles now reference primary entities: "Discharge Summary: Maria Elena Gonzalez" instead of generic "Discharge Summary #1".
- **Realistic entity descriptions** — Replaced generic "Comprehensive patient profile for..." with POLE-type-aware descriptions using domain roles and industries (e.g., "Dr. Sarah Chen, attending physician specializing in healthcare").
- **Domain-aware Organization.industry** — Added `DOMAIN_INDUSTRY_POOL` for all 22 domains. Healthcare organizations get "Hospital Systems" instead of "Technology".
- **Realistic decision trace observations** — Observations now reference actual entity names: "Verified Dr. Sarah Chen against healthcare standards" instead of generic "Found 7 relevant records".
- **Improved thinking text filter** — Added continuation patterns to catch multi-sentence agent thinking blocks between tool calls.

### New Agent Tools (All 22 Domains)
- **`list_*` tools** — Every domain now has a list tool for its primary entity type (e.g., `list_patients`, `list_players`, `list_accounts`) with sort and limit parameters.
- **`get_*_by_id` tools** — Every domain now has a direct ID lookup tool that returns the entity with all connections (e.g., `get_patient_by_id`, `get_player_by_id`).
- **Gaming-specific** — Added `get_top_players` tool (sort by level) for the gaming domain.

### Frontend Improvements
- **"Ask about this" button** — Clicking a node in the Knowledge Graph shows an "Ask about [entity]" button that sends a query to the chat.
- **Node hover tooltips** — Graph nodes show full name, labels, and key properties on hover.
- **Health polling optimization** — Reduced polling frequency from 30s to 60s.
- **Responsive hint text** — Keyboard shortcut hint hidden on small screens to prevent overlap.
- **Suggested question max width** — Pill buttons capped at 320px to prevent layout stretching.
- **Scrollable label badges** — Label filter badges in the graph panel scroll when they overflow.
- **Seed constraint fix** — Entity seeding now uses `ON CREATE SET / ON MATCH SET` to avoid constraint violations on re-seed.

### Documentation
- **4 new docs pages** — "Use Neo4j Aura", "Use Docker", "Why Context Graphs?", "Framework Comparison"
- **Updated sidebars** — All new pages added to Docusaurus navigation

### Testing
- 602 passing tests (57 new), up from 545

## v0.6.0 — Comprehensive Testing Feedback (2026-03-28)

### Framework Fixes
- **CrewAI no longer hangs** — Added explicit `llm="anthropic/claude-sonnet-4-20250514"` to prevent defaulting to OpenAI. Added request-level logging and reduced timeout to 60s.
- **Strands serialization fix** — Added `_extract_text()` helper that robustly extracts text from agent results, handling `ParsedTextBlock` serialization issues from newer Anthropic SDK versions.
- **Google ADK API key support** — Added `--google-api-key` CLI flag (`GOOGLE_API_KEY` env), wizard prompt when google-adk is selected, and `GOOGLE_API_KEY` in generated `.env`/`.env.example` templates.

### Document & Trace Ingestion Fix
- **`--ingest` now creates proper Document and DecisionTrace nodes** — Both ingestion paths now create `:Document` and `:DecisionTrace`/`:TraceStep` nodes using direct Cypher, matching the `generate_data.py` pattern that the frontend expects. Previously, Documents and Decision Traces panels appeared empty after `--ingest`.
- **Entity MERGE fix** — Direct driver ingestion now uses `MERGE (n:Label {name: $name}) SET ...` instead of `MERGE (n:Label {all_props})`, preventing duplicate nodes.

### Data Quality
- **Domain-aware base entities** — Person, Organization, Location, Event, and Object entities now use domain-specific names and roles (doctors for healthcare, traders for finance, game designers for gaming, etc.).
- **Fixed templated property values** — Properties like "Metformin 500mg - Contraindications" now replaced with realistic values. Added pools for contraindications, dosage_form, allergies, sector, lead_reporter, manufacturer, mechanism_of_action, population_trend, and habitat.

### Frontend UI Improvements
- **Redesigned chat input** — Bordered container with focus highlight and keyboard shortcut hint (Chakra UI Pro inspired).
- **Suggested questions redesign** — Pill-shaped buttons with full text (no 60-char truncation), "Try these" label with Sparkles icon.
- **Message avatars** — User and assistant messages now have Circle avatars with User/Bot icons.
- **Tool progress counter** — Shows "Running tool N of M..." during tool execution.

### CLI
- **`--demo` convenience flag** — Shortcut for `--reset-database --demo-data --ingest`
- **`--google-api-key` flag** — New CLI flag with `GOOGLE_API_KEY` env variable support

### Testing
- 545 passing tests (35 new), up from 510

## v0.5.3 — Agent Loop Breakout Fix (2026-03-27)

### Bug Fixes
- **Prevent agents from returning pre-tool text as the final answer** — PydanticAI's `run_stream` fires a `FinalResultEvent` the moment any `TextPart` begins streaming. When Claude emits "I'll search for..." alongside a tool call, `run_stream` treats that text as the final output and exits before tool results are incorporated. Replaced `agent.run_stream()` + `stream_text()` with `agent.run()` in `handle_message_stream`, which completes the full agent loop before emitting text.
- **Ruff lint fixes** — Resolved lint errors across connectors, tests, and scripts.
- **Test assertion fix** — Directory conflict test now asserts on "not empty" instead of "already exists" for better cross-platform compatibility.

## v0.5.2 — Agent Framework Refinements (2026-03-26)

- Improved Anthropic Tools and Claude Agent SDK agent templates
- Enhanced `context_graph_client` event handling and error recovery
- ChatInterface component improvements
- Better error handling in API routes
- `generate_data.py` improvements for data quality
- 74 new ontology validation tests

## v0.5.1 — UX Improvements & Bug Fixes (2026-03-25)

### Bug Fixes
- SSR hydration fix in frontend components
- PydanticAI tool serialization fix — agent tools now return JSON string types correctly
- Google ADK hyphenated domain name sanitization
- HuggingFace warning suppression in agent templates

### Improvements
- Retry button on chat errors
- Agent thinking text collapsible filter — reasoning steps render in a collapsible "Show reasoning" section
- Strands `max_tokens` configuration support
- Cypher query validation tests across all 22 domains

## v0.5.0 — Data Quality & Domain Completeness (2026-03-24)

### New Features
- **22 complete domain ontologies** with pre-generated LLM fixture data shipped for all domains
- **Domain-specific static name pools** — 200+ realistic names across 50+ entity labels (medical diagnoses, financial instruments, software repos, etc.)
- Label-aware ID prefixes (`PAT-` for Patient, `ACT-` for Account, etc.)
- 12+ domain-specific property pools (currency codes, ticker symbols, drug classes, medical specialties, severities)
- `domain` property on all ingested entities for cross-domain isolation when sharing a Neo4j instance
- Structured document templates for static fallback data generation

### Bug Fixes
- Fixed missing SSE event messages in chat streaming
- Float value clamping for confidence/rating/efficiency fields

### Testing
- 510 passing tests (145 new), up from 365

## v0.4.6 — Conversation Fetching Fix (2026-03-24)

- Fixed conversation history fetching in `context_graph_client` for multi-turn sessions

## v0.4.5 — Framework & Build Fixes (2026-03-24)

- Fixed `pyproject.toml` build configuration bug
- Strands framework default changed from Bedrock to AnthropicModel
- Agent template improvements across multiple frameworks
- Domain YAML fixes for gaming, genai-llm-ops, healthcare, personal-knowledge, product-management, retail-ecommerce, software-engineering, and trip-planning

## v0.4.4 — Strands Model Default (2026-03-24)

- Changed Strands agent framework default from AWS Bedrock to Anthropic native model (`AnthropicModel`)

## v0.4.3 — API Keys & Docker Support (2026-03-23)

- Fixed API key handling and validation across agent frameworks
- Added `Dockerfile.backend` template for Docker builds
- Makefile improvements for containerized deployments

## v0.4.2 — E2E Testing & Bug Fixes (2026-03-23)

- Bug fixes across agent templates
- Playwright e2e test scaffolding for generated projects (`app.spec.ts`, `playwright.config.ts`)
- Improved e2e smoke testing infrastructure

## v0.4.1 — Streaming & E2E Infrastructure (2026-03-23)

- **Server-Sent Events (SSE) streaming** for real-time chat responses and tool call visualization
- `POST /chat/stream` endpoint with `asyncio.Queue`-based event streaming
- Token-by-token text streaming for PydanticAI, Anthropic Tools, Claude Agent SDK, OpenAI Agents, LangGraph
- Real-time tool call events with Timeline/Spinner/Collapsible UI components
- Text delta batching (~50ms) to optimize React re-renders
- E2E smoke testing infrastructure (`scripts/e2e_smoke_test.py`)
- Documentation updates

## v0.4.0 — Hardening, Security & DX (2026-03-23)

### Bug Fixes
- **Critical:** Enum identifier sanitization — special characters (`A+`, `A-`, `3d_model`) in domain ontology enum values now generate valid Python identifiers with value aliases
- **Critical:** Graceful degradation when Neo4j is unavailable — backend starts in degraded mode, `/health` endpoint reports connectivity status
- **High:** Cypher injection prevention in GDS client — label parameters validated against entity type whitelist
- **High:** CrewAI async/sync deadlock resolved — replaced bare `asyncio.run()` with `nest_asyncio`-compatible helper, crew execution moved to thread
- **High:** Claude Agent SDK model version now configurable via `ANTHROPIC_MODEL` environment variable
- **Medium:** Silent exception swallowing replaced with structured warning messages in `ingest.py` and `vector_client.py`
- **Medium:** JSON parsing errors in agent tool calls now return helpful error messages instead of crashing
- **Medium:** Input validation (`max_length`) added to chat and search request models
- **Low:** CLI validates empty project names before entering wizard
- **Low:** Healthcare YAML blood type enums properly quoted

### New Features
- `--dry-run` CLI flag — preview what would be generated without creating files
- `--verbose` CLI flag — enable debug logging during generation
- `/health` endpoint in generated projects — returns Neo4j connectivity status and app version
- CORS origins configurable via `CORS_ORIGINS` environment variable
- `constants.py` module in generated projects — centralizes magic strings (index names, graph projections, embedding dimensions)
- Document browser pagination (page size 20, prev/next controls)
- Semantic HTML landmarks (`<main>`, `<section>`, `<aside>`) and ARIA labels in frontend
- Actionable error messages in chat interface — distinguishes backend errors, network failures, and Neo4j unavailability

### Security
- Query timeouts (30s default) on all Neo4j operations
- Credential warnings in generated `.env.example`
- CORS production configuration guidance

### Testing
- 365 passing tests (51 new), up from 314
- New: enum identifier sanitization edge cases
- New: models.py compilation across all 22 domains (prevents enum regression)
- New: v0.4.0 feature validation (health endpoint, constants, graceful degradation, input validation, CORS, pagination)
- New: CLI validation and flag tests

## v0.3.0 — Memory Integration, Multi-Turn & Graph Visualization (2026-03-23)

- neo4j-agent-memory integration for multi-turn conversations
- Interactive NVL graph visualization (schema view, double-click expand, drag/zoom, property panel)
- LLM-generated demo data (80-90 entities, 25+ documents, 3-5 decision traces per domain)
- Markdown rendering in chat with tool call visualization
- Document browser and entity detail panel
- Improved graph visualization and frontend styling
- Docusaurus documentation site setup and deployment
- Improved domain fixture data quality
- 314 passing tests

## v0.2.0 — Connectors & Custom Domains (2026-03-22)

### New Features
- **7 SaaS data connectors** — GitHub, Notion, Jira, Slack, Gmail, Google Calendar, Salesforce
- Each connector implements `BaseConnector` ABC with `authenticate()`, `fetch()`, and `get_credential_prompts()`
- Gmail/Google Calendar prefer `gws` CLI with Python OAuth2 fallback
- **Custom domain generation** — generate complete domain ontology YAMLs from natural language descriptions using LLM (Anthropic/OpenAI)
- Custom domains saved to `~/.create-context-graph/custom-domains/` for reuse
- Neo4j Aura `.env` import and `neo4j-local` support in wizard
- Documentation site (Docusaurus) with deployment configuration

## v0.1.1 — Initial Bug Fixes (2026-03-22)

- Bug fixes for CLI and template rendering
- Test improvements and expanded coverage
- Added `.gitignore` to generated projects

## v0.1.0 — Initial Release (2026-03-22)

- Interactive CLI scaffolding tool (`create-context-graph`) invoked via `uvx` or `npx`
- 7-step interactive wizard with Questionary prompts
- **8 agent frameworks:** PydanticAI, Claude Agent SDK, OpenAI Agents SDK, LangGraph, CrewAI, Strands, Google ADK, Anthropic Tools
- Domain ontology system with YAML definitions and two-layer inheritance (`_base.yaml`)
- Jinja2 template engine generating full-stack projects (FastAPI backend, Next.js + Chakra UI v3 frontend)
- Neo4j schema generation (constraints + GDS projections)
- Static and LLM-powered synthetic data generation pipeline
- Neo4j data ingestion via `neo4j-agent-memory` or direct driver fallback
- Domain-specific agent tools with Cypher queries
- NVL graph visualization component

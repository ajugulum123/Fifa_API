# Accomplishments Log

## 2026-04-10 — Cursor Rules Infrastructure
- Set up `.cursor/rules/` with 7 alwaysApply and glob-scoped rules
- Karpathy discipline rule extracted from MasterRepo(s)/andrej-karpathy-skills
- Graph architecture rule encodes all 11 non-negotiable principles with reference repo mapping table
- Python API rule maps file locations and patterns to specific MasterRepo(s)/ repos

## 2026-04-10 — Brand Consistency & No-Emoji Policy
- Added no-emoji rule (#9) to the agent SYSTEM_PROMPT in llm.py
- Removed all hardcoded emojis from llm.py fallback messages and finance_policy.py narrative templates
- Aligned the application UI with the sorraia.com marketing website design language:
  - Switched font stack from Inter to IBM Plex family (Sans, Serif, Mono) — brand consistency
  - Changed accent color from neutral white to #2563EB (Sorraia brand blue)
  - Updated semantic colors to match website tokens (green #10B981, warning #D97706, error #DC2626)
  - Applied IBM Plex Mono for labels, eyebrows, and data displays (matching website pattern)
  - Updated active nav states, send button, agent toggle, and empty-state icons to use brand blue
  - Aligned focus rings, selection color, and radial glow texture to brand blue tint
  - Updated prose-ai blockquotes to use serif font (IBM Plex Serif) for editorial distinction

## 2026-04-10 — Multi-Source Connector Architecture
- Built Stripe connector (stripe_connector.py) with graph ingestion for charges, payouts, customers, subscriptions
  - Creates REVENUE_FROM, PAID_BY, CUSTOMER_OF, HAS_SUBSCRIPTION, RECURRING_REVENUE edges
  - Extracts MRR from subscription items, maps charges to customers
- Built Google Drive connector (gdrive.py) with financial document scanning
  - Reads spreadsheets, documents, PDFs from configured folders via service account
  - Creates SOURCED_FROM, MENTIONS_AMOUNT, REFERENCES_VENDOR, REFERENCES_INVOICE edges
  - Content extraction via Google Drive export API
- Enhanced existing Slack and Email connectors (already built, now registered and API-accessible)
- Updated connector registry to register all 4 connectors (Stripe, Slack, Email, GDrive)
- Overhauled connectors API router with env-based credential resolution, per-connector connect/disconnect/status
- Added connector config fields to Settings (config.py): STRIPE_API_KEY, SLACK_BOT_TOKEN, EMAIL_*, GDRIVE_*
- Added 2 new LLM tools: search_connector_entities, list_connected_sources
- Updated SYSTEM_PROMPT to describe multi-source connector architecture
- Built full Data Sources UI section in Settings page with per-connector cards, sync buttons, and status indicators
- Updated .env.example with all connector env variables

## 2026-04-10 — PDF Citation & Document Serving
- Added `file_path` column to `documents` table (schema + migration) to persist original PDF location
- Updated PDF ingestion to store `file_path` on every parsed document
- Added `GET /documents/{doc_id}/file` endpoint serving original PDFs via FileResponse
- Fixed all column name mismatches in statement_tools.py (file_name->filename, line_date->txn_date, matched_txn_id->matched_transaction_id, doc_type->source_type, period_start->date_range_start, period_end->date_range_end)
- Every statement tool now returns `document_url` and `document_id` for citation linking
- Added `search_documents` tool — searches documents by filename/content, returns citation-ready results
- Added `search_documents` LLM tool definition and dispatcher
- Added citation rule (#10) to SYSTEM_PROMPT: `[PDF_CITE](url|filename|info)` format
- Built `PDFCitationCard` frontend component — clickable inline cards with FileText icon, blue accent styling
- Updated `AIMarkdown` to parse both `[PDF_CITE]` and markdown-style `/documents/` links, rendering them as citation cards
- Agent can now: cite source PDFs inline, user can click to open the original PDF in a new tab

## 2026-04-10 — Code Intelligence Pillar Implementation (5 Repos)
Cross-referenced Code Intelligence extraction guide (Upsonic, Formance, Graphiti, TaxHacker, Rever) against codebase. Identified 15 gaps, implemented all critical ones:

### Upsonic (PII Safety + Reliability Layer)
- Created `services/pii_safety.py` — financial data detection engine with 9 PII types
  - Credit card (Visa/MC/Amex/Discover) with Luhn checksum validation
  - SSN, SWIFT/BIC, ABA routing numbers (with checksum), IBAN, EIN/TIN
  - Bitcoin/Ethereum crypto wallet addresses, bank account patterns
  - `scan_text()`, `redact_text()`, `scan_dict()`, `route_to_graph_or_block()`
  - Block/Anonymize/Replace/RaiseException action enum
- Created `services/reliability.py` — Pydantic validation for agent outputs
  - `TransactionCategorizationResult`, `AgentToolResult`, `ValidatedResponse` models
  - `validate_agent_output()` cross-references PII + cited amounts
  - `validate_tool_result()` wraps raw JSON in typed result
  - `run_with_retry()` exponential backoff wrapper

### Formance (Audit Log Fix)
- Fixed critical schema drift in `audit_tools.py` — queries used wrong column names
  - `action` -> `operation_type`, `detail` -> `payload_json`
  - `entry_hash` -> `content_hash`, `prev_hash` -> `previous_hash`
  - All 4 queries (trail, summary, chain sample, recent) now align with DDL
  - Hash chain verification works correctly against actual schema

### TaxHacker (Category llm_prompt + Multi-line + Multi-currency)
- Wired `accounts.llm_prompt` into `categorization.py` as Signal 4
  - Extracts keywords from llm_prompt, matches against transaction memo/vendor name
  - Boosts confidence proportionally, adds reasoning citing the account context
- Added `transaction_line_items` table for multi-line transaction support
- Added multi-currency columns: `currency`, `exchange_rate`, `converted_amount` on transactions

### Rever (PO-Invoice Matching + Vendor Dedup)
- Created `services/po_matching.py` — Two-Way PO-Invoice Matching
  - `match_po_to_invoice()` with variance calculation, flag detection, graph edge creation
  - `auto_match_pos()` scans open POs, matches by vendor + amount + date proximity
  - `find_unmatched_pos()`, `get_po_status()`, `get_po_variance_report()`
  - Creates MATCHED_TO and EVIDENCED_BY graph edges between POs and invoices
- Added `purchase_orders` and `po_invoice_matches` tables to schema
- Created `services/vendor_dedup.py` — entity resolution engine
  - `find_duplicate_vendors()` weighted scoring: name similarity (50%), company (15%), spending overlap (25%), community (10%)
  - `merge_vendors()` reassigns transactions/edges, creates MERGED_INTO edge
  - `undo_vendor_merge()` reverses via audit trail
  - `get_vendor_merge_candidates()` returns top pairs
- Added vendor dedup columns: `canonical_vendor_id`, `is_duplicate`, `merge_confidence`

### MCP + LLM Tool Wiring
- Added 7 new LLM tools: `match_po_to_invoice`, `auto_match_purchase_orders`, `find_unmatched_purchase_orders`, `get_po_variance_report`, `find_duplicate_vendors`, `merge_vendors`, `scan_for_pii`
- Created `procurement_safety` MCP server with 6 tools (PO matching, vendor dedup, PII)
- All dispatchers wired in `_execute_tool` with lazy imports

## 2026-04-10 — Deep Dive Implementation (Upsonic + Formance)
Cross-referenced Deep Dive analysis sheets against codebase. Implemented all remaining gaps:

### Formance Ledger Patterns
- **Atomic Multi-Posting** (`services/atomic_posting.py`): DB transaction context manager (`db.transaction()`) for true atomicity. `create_posting()` writes all legs (debit/credit lines + POSTS edges) in a single transaction — all succeed or all roll back. `reverse_posting()` implements Formance Reverse() as edge invalidation + compensating entries.
- **World Account** (`services/world_account.py`): `@world` account as external source/sink node. `record_external_inflow()` and `record_external_outflow()` create FLOWS_TO edges with fact fields. `get_world_account_flows()` shows the boundary between client graph and external world. All bank feeds traceable to @world origin.

### Upsonic Agent Framework Patterns
- **3-Point Safety Interception** (`pii_safety.py` + `orchestrator.py`): Added `intercept_user_input()`, `intercept_agent_output()`, `intercept_tool_result()`. Wired at all 3 points in orchestrator: Point 1 at pipeline entry, Point 2 before response, Point 3 after each tool execution. Wrapped in try/except so safety never blocks the pipeline.
- **Multi-Agent Teams** (`agents/teams.py`): `AgentTeam` with `TeamMode.PARALLEL` and `TeamMode.SEQUENTIAL`. HITL `Checkpoint` system with Continue/Pause/Abort/Modify actions. Pre-built factories: `create_transaction_processing_team()` (sequential: Extract -> Categorize -> Reconcile -> Report) and `create_analysis_team()` (parallel: GL + FPA + Risk with supervisor merge).
- **Session Memory** (`agents/memory.py`): Added `SessionMemory` class with `full_session_memory` flag. Tracks facts, tool history, context window. `get_or_create_session()` and `end_session()` lifecycle. Persists session facts to `agent_memory` table on end.
- **OCR Abstraction Layer** (`services/ocr_layer.py`): Pluggable engine registry with `BaseOCREngine` abstract class. `PdfplumberEngine` (default, no extra deps) and `TesseractEngine` implementations. `extract_document()` pipeline with automatic fallback when confidence < 0.5. Document type routing (invoices -> Tesseract preferred).
- **.claude/agents/ Directory**: Created 5 production Claude Code agent definitions:
  - `transaction-categorizer.md` — GL categorization with graph reasoning
  - `reconciliation-reviewer.md` — Statement matching with PDF citations
  - `journal-entry-writer.md` — Atomic posting with @world account
  - `financial-report-generator.md` — Multi-format reports with Excel export
  - `fraud-risk-analyst.md` — Temporal graph fraud detection

### Skills Upgrade Plan Integration (Upgrades 1-5)

- **MCP Bridge Dispatch** (`services/llm.py`): Added fallback to `MCPRegistry.call_tool()` at the end of the `_execute_tool` dispatch chain. Any tool registered in the 10 MCP servers but not yet in the explicit elif chain is now reachable. Lazy initializes registry via `register_all_servers()` on first use.
- **SessionMemory Wired into Chat Path** (`routers/chat.py`): Chat router now creates/retrieves `SessionMemory` per request using SHA-256 session ID derivation. User queries added as context before streaming; assistant responses captured and persisted after stream. `DELETE /chat/session/{session_id}` endpoint flushes session to long-term `agent_memory`.
- **Proactive Monitoring Scheduler** (`main.py` lifespan): Background `asyncio.create_task` runs `_monitoring_loop()` every 6 hours, calling `run_monitoring_sweep()` from `agents/monitor.py`. Failures logged as warnings without crashing the app.
- **A2A Agent Cards** (`routers/a2a.py`): Published `transaction_agent` and `relationship_agent` as A2A-compatible services. `/.well-known/agent.json` directory endpoint. Individual card endpoints at `/.well-known/agent/{agent_id}.json`. `POST /a2a/{agent_id}` invocation endpoint routes through the full orchestrator pipeline.

### Priority Action Board Integration (15 Repos)

- **CLAUDE.md** (Karpathy-skills pattern): Created root `CLAUDE.md` with project overview, architecture, key directories, non-negotiable principles, commands, and code style.
- **Bi-temporal "as of date" Queries** (Graphiti pattern): Added `query_graph_as_of` and `get_account_balance_as_of` to `temporal_graph.py`. Returns graph state at any point in time by filtering `valid_at/invalid_at` windows. Registered as LLM tools.
- **RBAC Permission Layer** (NocoBase pattern): Created `services/rbac.py` with 5 roles (Admin, CFO, Analyst, Viewer, Agent). Pydantic `Permission` model with `can_write_graph`, `can_approve_reviews`, `can_export_data`, `can_manage_connectors`, `allowed_tools` constraints. `user_roles` DB table with tenant scoping.
- **QBO Sync Audit Hooks**: Added audit log entries after each `graph_builder.build_entity` call in `sync.py`, creating tamper-evident record of every graph write during QBO sync.
- **Reconciliation Match Endpoints** (abstra-app pattern): Added `POST /reconciliation/match` (manual match with graph edge) and `POST /reconciliation/auto-match` (amount + 3-day proximity matching with confidence scoring). Both create `MATCHED_TO` graph edges.
- **Graph Visualization API** (Understand-Anything pattern): Created `routers/graph_viz.py` with `GET /graph/topology` (filterable nodes/edges), `GET /graph/entity/{type}/{id}` (neighborhood), and `GET /graph/stats` (summary). Output format compatible with react-force-graph, cytoscape, d3.

## 2026-04-13 — PDF Attachment System for Agent Responses
- Enhanced agent to automatically surface PDF document references as attachments in chat responses
- `PDFCitationCard` upgraded from plain link to expandable inline PDF viewer (click to preview, external link to open in new tab)
- `extractPDFAttachments()` utility extracts `document_url`/`document_id` from tool results at `TOOL_CALL_END`
- Added `attachments` field to `ChatMessage` with deduplication by `documentId`
- "Referenced Documents" section renders below message content when tools return PDF data
- Fixed `trace_transaction_flow` to include `document_id`, `document_url`, and `source_type` in statement evidence
- Pattern: tools return structured data with `document_url` fields; frontend auto-extracts and renders them as first-class attachments

## 2026-04-13 — Memory Layer Completion
- Audited and fixed the full memory pipeline: DB schema, service layer, tool exposure, and orchestrator wiring
- Added `episode_messages` table (was missing from schema despite skill spec)
- Added LLM-based fact extraction (`extract_and_store_facts`) using Claude Haiku with financial-domain prompt
- Added 3 memory tools to the agent: `search_memory`, `remember_fact`, `list_memories`
- Wired `tenant_id` through `_execute_tool()` → orchestrator → tool handlers (was missing)
- Added auto-extraction every 5 turns via `SessionMemory.maybe_extract_facts()`
- Wired auto-extraction into `chat.py` agent_stream completion handler
- Key fix: memory was read-only before (loaded facts but never wrote them back)

## 2026-04-13 — Karpathy Discipline: Codebase Optimization
- Applied Andrej Karpathy's coding discipline principles (from MasterRepo(s)/andrej-karpathy-skills) to clean up the codebase
- Removed unused imports across 5 files (re, SPECIALISTS_BY_TIER, ExecutionPlan/StepStatus, json/math/timedelta, Optional)
- Replaced 7 silent `except: pass` blocks with `logger.debug()` calls to prevent invisible bug hiding
- Fixed 2 `'var' in dir()` hacks with proper variable initialization before try/except
- Extracted duplicate BFS traversal in graph_tools.trace_provenance into reusable `_bfs_edges()` helper (cut ~30 lines)
- Fixed dead propagation math in propagate_impact: `amount * (w / max(w, 1.0))` was a no-op, replaced with `amount * min(w, 1.0)`
- Wired up unused `time_window_days` parameter in detect_split_transactions (SQL was hardcoded to 3 days)
- Hoisted inline `import json` to module level in temporal_graph.py
- Pattern: Karpathy's "Simplicity First" and "Surgical Changes" principles are effective guardrails

## 2026-04-13 — Refined PDF/Excel preview + download UI from archive patterns
- Extracted reusable SVG components: `ExcelSvgIcon`, `PdfSvgIcon`, `DownloadArrowSvg` from archive's ArtifactPanel/PdfPanel
- Refined `ExcelDownloadCard` with green-tinted icon container and dedicated download button matching archive style
- Refined `PDFCitationCard` with red-tinted icon container, loading spinner during iframe load, and ChevronDown from lucide
- Added `TableDownloadButton` that attaches Excel SVG + CSV export to markdown tables rendered in AI responses (adapted from archive's `attachTableDownloadButtons` pattern)
- File upload chips now use proper PDF/Excel SVGs with color-coded borders instead of generic FileText icon
- All changes in single file: `sorraia/apps/web/app/(app)/chat/page.tsx`
- Build verified clean: `next build` passes with 0 errors

## 2026-04-13 — Azure GPT-5.3 as primary LLM + secrets management
- Switched from Anthropic Claude to Azure Foundry GPT-5.3 as primary LLM
- Key discovery: Azure Foundry v1 API requires `AsyncOpenAI(base_url=endpoint + "/openai/v1")` instead of `AsyncAzureOpenAI` -- the dated `api-version` parameter is not supported
- Key discovery: GPT-5.3 rejects `max_tokens` -- must omit it (SDK handles `max_completion_tokens` internally)
- Created `.env` secrets file at `sorraia/apps/api/.env` (gitignored), updated `.env.example` with Azure/NVIDIA/Gemini fields
- Upgraded `_llm_loop_openai` to emit AG-UI events, truncate results, handle generative components -- parity with the Anthropic loop
- Memory fact extraction now tries Azure first, falls back to Anthropic
- Reusable pattern: for Foundry endpoints, always use `AsyncOpenAI` + `base_url` with `/openai/v1` suffix

## 2026-04-14 — Full UI redesign: black/white/blue financial-grade palette
- Replaced dark-on-dark theme with light chat feed (#f7f8fa) + dark sidebar (#0d1117) split
- New brand accent #1253a4 replaces #2563EB across all components
- Sidebar: 30px logo mark, "Capital Intelligence" sub-brand, blue dot ledger indicator, #0f1c2e active states
- Topbar: white background, ledger badge (#e8f0fb), date label, dark user chip
- Chat feed: user messages as blue right-aligned bubbles (12px 12px 3px 12px radius), AI avatar 30px dark square with "AI" text
- Tool pills: #e8f0fb background, 8px blue dot prefix, 0.5px blue borders
- Input area: white wrapper, #f7f8fa inner row, 28px blue send button, styled disclaimer
- Download button: solid #1253a4 with chevron-in-box icon prefix
- All cards/file previews: white bg, 0.5px #d8dfe8 borders, 500 font weight max
- Typography: font-weight capped at 500, 10px uppercase labels with 0.08em letter-spacing
- Files changed: globals.css, sidebar.tsx, topbar.tsx, chat-sidebar.tsx, app-shell.tsx, chat/page.tsx

## 2026-04-13 — Graph visualization: camera fix + full edge type coverage
- **Root cause of centering bug**: camera transform used `translate(W/2+cam.x) -> scale -> translate(-W/2)` which is an overcomplicated model; `fitCameraToNodes` did not invert it correctly
- **Fix**: Simplified to `sx = wx*zoom + cam.x` (screen = world*zoom + offset). `fitCameraToNodes` just sets `cam.x = W/2 - centerX*zoom`
- **Root cause of missing edge types**: `ORDER BY weight DESC LIMIT N` grabbed only the highest-dollar FLOWS_TO edges
- **Fix**: Used `ROW_NUMBER() OVER (PARTITION BY edge_type)` to sample evenly across all edge types — now shows 13 relationship types (CATEGORIZED_AS, PAID_TO, MATCHED_TO, EVIDENCED_BY, etc.)
- Added `w2s()` helper for world-to-screen conversion; all drawing and tooltips use it
- Added palette colors for new entity types (account_type, document, statement)
- Sidebar now shows ALL edge types (removed 12-type cap) with human-readable labels

## 2026-04-14 — Typewriter text streaming for chat output
- Ported character-by-character typewriter streaming from `archives/quinn-financial-graph-LiveAgent/services/quinn_cfo_web/components/ChatMain.tsx`
- Adapted pattern for React state-based architecture: uses `displayContent` field on ChatMessage to decouple visual rendering from full received content
- Typewriter queue uses refs (`typewriterQueueRef`, `typewriterRunningRef`, `typewriterMsgIdRef`) to avoid stale closures
- Adaptive batch sizing: processes 1-4 chars per tick based on queue depth, with delays from 6ms (large backlog) to 22ms (near empty)
- `flushTypewriterQueue()` instantly renders remaining text when stream completes
- Files changed: `sorraia/apps/web/app/(app)/chat/page.tsx`

## 2026-04-14 — Follow-up question generation
- Ported contextual follow-up question system from the archive `quinn-financial-graph-LiveAgent`
- Backend: New `/api/followups` endpoint using Claude 3.5 Haiku for fast, low-cost generation of 3 specific follow-up questions
- Frontend: After each assistant response finalizes, async fetch generates follow-ups; rendered as clickable pill-shaped chips below the response
- Clicking a follow-up chip removes the chips and sends the question as a new message
- Questions are self-contained (no vague references like "this transaction") and specific to the data discussed
- Files changed: `sorraia/apps/api/sorraia/routers/followups.py` (new), `sorraia/apps/api/sorraia/main.py`, `sorraia/apps/web/app/(app)/chat/page.tsx`, `sorraia/apps/web/app/globals.css`

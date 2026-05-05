# Mistakes Log

## 2026-04-13 — Graph tools crashed on entity_name instead of entity_id
- **Root cause**: Tool schemas required `entity_id` (internal DB ID) but LLM only knows entity names
- **Fix**: Added `_resolve_entity_id()` helper + `entity_name` param to 5 tool schemas (trace_provenance, propagate_impact, entity_neighborhood, trace_money_flow, get_edge_timeline)
- **Prevention**: When adding graph tools, always accept name OR ID and resolve internally

## 2026-04-13 — Fraud scan SQL failed: EXTRACT on integer
- **Root cause**: `txn_date` is DATE type; `date - date` returns integer (days), not interval. `EXTRACT(EPOCH FROM integer)` is invalid.
- **Fix**: Replaced `EXTRACT(EPOCH FROM (date - date))` with `(date - date) * 24.0` for hours and plain `(date - date)` for days
- **Prevention**: Always check column types before using EXTRACT/interval arithmetic in PostgreSQL

## 2026-04-13 — temporal_pagerank datetime comparison crash
- **Root cause**: DB timestamps are timezone-aware, `datetime.now()` is naive. Subtraction fails.
- **Fix**: Strip `tzinfo` from both operands in `_recency_weight()` before comparison
- **Prevention**: Always normalize tz-awareness when mixing DB timestamps with Python datetime

## 2026-04-13 — Memory fact extraction 404: wrong model name
- **Root cause**: `memory.py` used `claude-haiku-4-20250414` which doesn't exist
- **Fix**: Changed to `claude-haiku-4-5-20251001` (matching orchestrator)
- **Prevention**: Use a constant or config for model names, not inline strings

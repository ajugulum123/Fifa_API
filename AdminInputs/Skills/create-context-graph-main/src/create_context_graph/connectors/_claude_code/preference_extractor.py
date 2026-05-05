# Copyright 2026 Neo4j Labs
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Preference extraction from Claude Code sessions.

Identifies developer preferences through:
1. **Explicit statements** — user says "always use X", "prefer Y over Z".
2. **Repeated tool patterns** — consistent behaviours across sessions.
3. **Package frequency** — packages installed across multiple sessions.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from typing import Any

# ---------------------------------------------------------------------------
# Explicit preference patterns
# ---------------------------------------------------------------------------

_EXPLICIT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\balways\s+use\s+(.{3,60})", re.I), "coding_style"),
    (re.compile(r"\bnever\s+use\s+(.{3,60})", re.I), "coding_style"),
    (re.compile(r"\bprefer\s+(.{3,60})\s+over\s+(.{3,60})", re.I), "framework_choice"),
    (re.compile(r"\bdon'?t\s+use\s+(.{3,60})", re.I), "coding_style"),
    (re.compile(r"\buse\s+(.{3,40})\s+instead\s+of\s+(.{3,40})", re.I), "framework_choice"),
    (re.compile(r"\bmake\s+sure\s+to\s+(.{3,60})", re.I), "coding_style"),
    (re.compile(r"\bI\s+prefer\s+(.{3,60})", re.I), "coding_style"),
    (re.compile(r"\bwe\s+should\s+always\s+(.{3,60})", re.I), "coding_style"),
    (re.compile(r"\bI\s+like\s+(?:to\s+)?(.{3,60})", re.I), "coding_style"),
    (re.compile(r"\bwrite\s+tests?\s+first\b", re.I), "testing_approach"),
    (re.compile(r"\buse\s+(?:strict\s+)?type\s*(?:hints?|annotations?)\b", re.I), "coding_style"),
    (re.compile(r"\badd\s+docstrings?\b", re.I), "documentation"),
    (re.compile(r"\buse\s+(ruff|black|prettier|eslint|flake8|mypy)\b", re.I), "tool_configuration"),
    (re.compile(r"\buse\s+(pytest|jest|vitest|mocha)\b", re.I), "testing_approach"),
    (re.compile(r"\buse\s+(snake_case|camelCase|PascalCase)\b", re.I), "naming_convention"),
]

# Package install command patterns for frequency analysis.
_INSTALL_CMD_RE = re.compile(
    r"(?:pip|pip3|uv pip)\s+install\s+([\w-]+)"
    r"|npm\s+install\s+([\w@/-]+)"
    r"|yarn\s+add\s+([\w@/-]+)"
    r"|pnpm\s+add\s+([\w@/-]+)"
    r"|cargo\s+add\s+([\w-]+)"
    r"|go\s+get\s+([\w./]+)"
)

# Minimum sessions a package must appear in to become a preference.
_MIN_PACKAGE_SESSIONS = 2
# Minimum confidence to emit a preference.
_MIN_CONFIDENCE = 0.4


def extract_preferences(
    parsed_sessions: list[dict[str, Any]],
) -> dict[str, Any]:
    """Analyse all sessions for developer preferences.

    Parameters
    ----------
    parsed_sessions:
        List of outputs from ``parser.parse_session()``.

    Returns
    -------
    dict
        ``{"entities": {...}, "relationships": [...]}``
    """
    entities: dict[str, list[dict[str, Any]]] = {}
    relationships: list[dict[str, Any]] = []

    # Collect all explicit preferences across sessions.
    seen_prefs: dict[str, dict[str, Any]] = {}  # key -> pref record

    for session in parsed_sessions:
        session_id = session["session_id"]
        messages = session.get("messages", [])

        for msg in messages:
            if msg["role"] != "user":
                continue

            text = msg.get("full_content", msg.get("content", ""))
            if not text:
                continue

            for pattern, category in _EXPLICIT_PATTERNS:
                match = pattern.search(text)
                if not match:
                    continue

                # Build preference key from the matched text.
                pref_value = match.group(0).strip()[:100]
                pref_key = _normalise_key(pref_value)

                if pref_key in seen_prefs:
                    seen_prefs[pref_key]["session_count"] += 1
                    seen_prefs[pref_key]["confidence"] = min(
                        seen_prefs[pref_key]["confidence"] + 0.15, 0.95
                    )
                else:
                    seen_prefs[pref_key] = {
                        "name": f"pref-{_short_hash(pref_key)}",
                        "category": category,
                        "key": pref_key,
                        "value": pref_value,
                        "confidence": 0.6,
                        "extractedFrom": "explicit_statement",
                        "firstSeenAt": msg.get("timestamp", ""),
                        "session_count": 1,
                        "source_session": session_id,
                        "source_message": f"msg-{msg['uuid'][:12]}",
                    }

    # Package frequency analysis across sessions.
    package_sessions: dict[str, set[str]] = {}  # package -> set of session_ids
    for session in parsed_sessions:
        session_id = session["session_id"]
        for tc in session.get("tool_calls", []):
            if tc["tool_name"] != "Bash":
                continue
            cmd = tc.get("input", {}).get("command", "")
            if not cmd:
                continue
            for match in _INSTALL_CMD_RE.finditer(cmd):
                pkg = next((g for g in match.groups() if g), None)
                if pkg:
                    package_sessions.setdefault(pkg, set()).add(session_id)

    for pkg, sessions_set in package_sessions.items():
        if len(sessions_set) < _MIN_PACKAGE_SESSIONS:
            continue
        pref_key = f"package:{pkg}"
        if pref_key not in seen_prefs:
            seen_prefs[pref_key] = {
                "name": f"pref-{_short_hash(pref_key)}",
                "category": "framework_choice",
                "key": pref_key,
                "value": f"Frequently uses {pkg}",
                "confidence": min(0.4 + len(sessions_set) * 0.1, 0.9),
                "extractedFrom": "package_frequency",
                "firstSeenAt": "",
                "session_count": len(sessions_set),
                "source_session": "",
                "source_message": "",
            }

    # Tool usage pattern analysis.
    tool_counter = Counter[str]()
    for session in parsed_sessions:
        for tc in session.get("tool_calls", []):
            tool_counter[tc["tool_name"]] += 1

    # Emit entities and relationships for preferences above threshold.
    for pref_key, pref in seen_prefs.items():
        if pref["confidence"] < _MIN_CONFIDENCE:
            continue

        pref_entity = {
            "name": pref["name"],
            "category": pref["category"],
            "key": pref["key"],
            "value": pref["value"],
            "confidence": round(pref["confidence"], 2),
            "extractedFrom": pref["extractedFrom"],
            "firstSeenAt": pref["firstSeenAt"],
            "sessionCount": pref["session_count"],
        }
        entities.setdefault("Preference", []).append(pref_entity)

        # EXPRESSES_PREFERENCE from source message (if known).
        if pref.get("source_message"):
            relationships.append({
                "type": "EXPRESSES_PREFERENCE",
                "source_name": pref["source_message"],
                "source_label": "Message",
                "target_name": pref["name"],
                "target_label": "Preference",
            })

    return {
        "entities": entities,
        "relationships": relationships,
    }


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------


def _normalise_key(text: str) -> str:
    """Normalise preference text to a stable key."""
    return re.sub(r"\s+", " ", text.strip().lower())


def _short_hash(text: str) -> str:
    """Generate a short hash for deduplication."""
    return hashlib.md5(text.encode()).hexdigest()[:10]  # noqa: S324

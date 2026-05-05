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

"""Secret detection and redaction for Claude Code session content."""

from __future__ import annotations

import re

# Patterns for detecting secrets in session content.
# Each tuple is (compiled regex, replacement label).
_SECRET_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # Anthropic API keys
    (re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}"), "[REDACTED]"),
    # OpenAI / generic sk- keys
    (re.compile(r"sk-proj-[A-Za-z0-9_-]{20,}"), "[REDACTED]"),
    (re.compile(r"sk-[A-Za-z0-9]{20,}"), "[REDACTED]"),
    # GitHub tokens
    (re.compile(r"gh[ps]_[A-Za-z0-9]{36,}"), "[REDACTED]"),
    (re.compile(r"gho_[A-Za-z0-9]{36,}"), "[REDACTED]"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{22,}"), "[REDACTED]"),
    # Slack tokens
    (re.compile(r"xox[bpras]-[A-Za-z0-9-]{10,}"), "[REDACTED]"),
    # AWS access keys
    (re.compile(r"AKIA[0-9A-Z]{16}"), "[REDACTED]"),
    # Bearer / token auth headers
    (re.compile(r"Bearer\s+[A-Za-z0-9._-]{20,}"), "Bearer [REDACTED]"),
    (re.compile(r"Authorization:\s*\S+\s+[A-Za-z0-9._-]{20,}"), "Authorization: [REDACTED]"),
    # Generic API key assignments (key=value, KEY: value, etc.)
    (re.compile(
        r"(?i)(api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token)"
        r"""[\s]*[=:]\s*["']?[A-Za-z0-9._/+-]{16,}["']?"""
    ), r"\1=[REDACTED]"),
    # Password assignments
    (re.compile(
        r"(?i)(password|passwd|pwd)"
        r"""[\s]*[=:]\s*["']?[^\s"']{4,}["']?"""
    ), r"\1=[REDACTED]"),
    # Connection strings with embedded credentials
    (re.compile(
        r"(?i)(mysql|postgres|postgresql|mongodb|redis|amqp|neo4j)://"
        r"[^:]+:[^@]+@"
    ), r"\1://[REDACTED]@"),
    # .env-style sensitive variable assignments
    (re.compile(
        r"(?m)^((?:ANTHROPIC|OPENAI|GOOGLE|GITHUB|SLACK|LINEAR|AWS|AZURE|DATABASE|DB|NEO4J)"
        r"[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|CREDENTIALS?))"
        r"""=["']?[^\s"']+["']?"""
    ), r"\1=[REDACTED]"),
]


def redact_secrets(text: str) -> str:
    """Replace detected secrets in *text* with ``[REDACTED]`` markers.

    The function applies a series of regex patterns to detect common secret
    formats (API keys, tokens, passwords, connection strings) and replaces
    them.  It is intentionally conservative – false negatives are preferred
    over false positives that would destroy useful session content.
    """
    if not text:
        return text
    result = text
    for pattern, replacement in _SECRET_PATTERNS:
        result = pattern.sub(replacement, result)
    return result

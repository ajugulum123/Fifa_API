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

"""JSONL parser for Claude Code session files.

Claude Code stores session logs as JSONL files in ``~/.claude/projects/``,
organised by project directory path.  Each file contains a timestamped
sequence of user messages, assistant responses (with tool_use blocks),
tool results, and subagent progress entries.

This module provides helpers to:
* discover project directories and decode their encoded paths,
* discover session JSONL files within a project,
* parse a single session file into a structured representation.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Message types we care about (others are skipped).
_RELEVANT_TYPES = {"user", "assistant", "progress"}

# Tool names that modify files.
_WRITE_TOOLS = {"Write", "Edit", "NotebookEdit"}
# Tool names that read files.
_READ_TOOLS = {"Read", "Grep", "Glob"}

# Regex to extract file paths from Bash commands (simple heuristic).
_BASH_FILE_RE = re.compile(
    r"""(?:cat|head|tail|less|more|nano|vim|vi|code|open)\s+["']?([^\s"'|><;]+)"""
)


# ---------------------------------------------------------------------------
# Project discovery
# ---------------------------------------------------------------------------


def _decode_project_path(encoded: str) -> str:
    """Decode an encoded project directory name back to a filesystem path.

    Claude Code encodes absolute paths by replacing ``/`` with ``-``.
    For example ``-Users-lyonwj-github-foo`` becomes ``/Users/lyonwj/github/foo``.

    The heuristic: the leading ``-`` is always a path separator.  For the
    remaining segments we reconstruct the path by replacing ``-`` with ``/``.
    This is imperfect when directory names contain hyphens, but it is
    sufficient for display purposes.
    """
    if not encoded.startswith("-"):
        return encoded
    # Replace leading dash with / and remaining dashes with /
    return "/" + encoded[1:].replace("-", "/")


def discover_projects(base_path: Path | None = None) -> list[dict[str, Any]]:
    """Scan the Claude Code projects directory and return project metadata.

    Parameters
    ----------
    base_path:
        Override for ``~/.claude/projects``.  Useful for testing.

    Returns
    -------
    list[dict]
        Each dict has: ``name``, ``encoded_path``, ``decoded_path``,
        ``full_path`` (Path), ``session_count``.
    """
    if base_path is None:
        base_path = Path.home() / ".claude" / "projects"

    if not base_path.is_dir():
        logger.warning("Claude Code projects directory not found: %s", base_path)
        return []

    projects: list[dict[str, Any]] = []
    for entry in sorted(base_path.iterdir()):
        if not entry.is_dir():
            continue
        # Count JSONL files directly in the project directory.
        session_files = list(entry.glob("*.jsonl"))
        decoded = _decode_project_path(entry.name)
        projects.append({
            "name": decoded,
            "encoded_path": entry.name,
            "decoded_path": decoded,
            "full_path": entry,
            "session_count": len(session_files),
        })

    return projects


# ---------------------------------------------------------------------------
# Session discovery
# ---------------------------------------------------------------------------


def discover_sessions(
    project_dir: Path,
    *,
    since: str | None = None,
    max_sessions: int = 0,
) -> list[dict[str, Any]]:
    """List session JSONL files in *project_dir*.

    Parameters
    ----------
    project_dir:
        Full path to a project directory under ``~/.claude/projects/``.
    since:
        ISO-8601 date string.  Only sessions modified after this date are
        returned.
    max_sessions:
        Maximum number of sessions to return (most recent first).
        ``0`` means no limit.

    Returns
    -------
    list[dict]
        Each dict has: ``session_id``, ``jsonl_path``, ``modified``,
        ``git_branch``, ``cwd``.
    """
    if not project_dir.is_dir():
        return []

    since_dt: datetime | None = None
    if since:
        try:
            since_dt = datetime.fromisoformat(since).replace(tzinfo=timezone.utc)
        except ValueError:
            logger.warning("Invalid --claude-code-since date: %s", since)

    sessions: list[dict[str, Any]] = []
    for jsonl_file in sorted(project_dir.glob("*.jsonl")):
        # Session ID is the filename stem (UUID).
        session_id = jsonl_file.stem

        # Use file modification time for filtering and sorting.
        mtime = jsonl_file.stat().st_mtime
        modified_dt = datetime.fromtimestamp(mtime, tz=timezone.utc)

        if since_dt and modified_dt < since_dt:
            continue

        # Read first few lines to extract metadata.
        meta = _extract_session_metadata(jsonl_file)

        sessions.append({
            "session_id": session_id,
            "jsonl_path": jsonl_file,
            "modified": modified_dt.isoformat(),
            "git_branch": meta.get("git_branch", ""),
            "cwd": meta.get("cwd", ""),
            "first_prompt": meta.get("first_prompt", ""),
        })

    # Sort by modification time, most recent first.
    sessions.sort(key=lambda s: s["modified"], reverse=True)

    if max_sessions > 0:
        sessions = sessions[:max_sessions]

    return sessions


def _extract_session_metadata(jsonl_path: Path) -> dict[str, str]:
    """Read the first few lines of a JSONL file to extract metadata."""
    meta: dict[str, str] = {}
    try:
        with open(jsonl_path, encoding="utf-8") as f:
            for i, raw_line in enumerate(f):
                if i > 20:  # Don't read more than 20 lines for metadata
                    break
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    entry = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue

                if entry.get("type") in ("queue-operation", "last-prompt"):
                    continue

                # Grab branch and cwd from first real message.
                if "gitBranch" in entry and "git_branch" not in meta:
                    meta["git_branch"] = entry["gitBranch"]
                if "cwd" in entry and "cwd" not in meta:
                    meta["cwd"] = entry["cwd"]

                # Grab first user prompt (non-meta).
                if (
                    entry.get("type") == "user"
                    and not entry.get("isMeta")
                    and "first_prompt" not in meta
                ):
                    content = _extract_text_content(entry.get("message", {}))
                    if content and len(content) > 5:
                        meta["first_prompt"] = content[:200]

                if all(k in meta for k in ("git_branch", "cwd", "first_prompt")):
                    break
    except OSError as exc:
        logger.warning("Could not read session file %s: %s", jsonl_path, exc)

    return meta


# ---------------------------------------------------------------------------
# Session parsing
# ---------------------------------------------------------------------------


def parse_session(
    jsonl_path: Path,
    *,
    content_mode: str = "truncated",
    max_content_len: int = 2000,
) -> dict[str, Any]:
    """Parse a single Claude Code session JSONL file.

    Parameters
    ----------
    jsonl_path:
        Path to the ``.jsonl`` file.
    content_mode:
        ``"full"`` stores complete message content, ``"truncated"``
        limits to *max_content_len* characters, ``"none"`` stores no
        content (metadata only).
    max_content_len:
        Maximum characters per message when *content_mode* is
        ``"truncated"``.

    Returns
    -------
    dict
        Structured session data with keys: ``session_id``, ``messages``,
        ``tool_calls``, ``files_touched``, ``errors``, ``metadata``.
    """
    session_id = jsonl_path.stem
    messages: list[dict[str, Any]] = []
    tool_calls: list[dict[str, Any]] = []
    tool_results_by_id: dict[str, dict[str, Any]] = {}
    files_touched: dict[str, dict[str, Any]] = {}  # path -> info
    errors: list[dict[str, Any]] = []
    progress_count = 0

    total_input_tokens = 0
    total_output_tokens = 0

    git_branch = ""
    cwd = ""
    first_timestamp = ""
    last_timestamp = ""
    version = ""

    try:
        with open(jsonl_path, encoding="utf-8") as f:
            for raw_line in f:
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    entry = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue

                entry_type = entry.get("type")
                if entry_type not in _RELEVANT_TYPES:
                    continue

                timestamp = entry.get("timestamp", "")

                # Track first/last timestamps.
                if timestamp:
                    if not first_timestamp:
                        first_timestamp = timestamp
                    last_timestamp = timestamp

                # Grab metadata from first entry.
                if not git_branch and entry.get("gitBranch"):
                    git_branch = entry["gitBranch"]
                if not cwd and entry.get("cwd"):
                    cwd = entry["cwd"]
                if not version and entry.get("version"):
                    version = entry["version"]

                if entry_type == "progress":
                    progress_count += 1
                    continue

                # Skip meta messages (system reminders, command outputs).
                if entry.get("isMeta"):
                    continue

                msg = entry.get("message", {})
                role = msg.get("role", "")
                uuid = entry.get("uuid", "")
                parent_uuid = entry.get("parentUuid")

                # Extract text content.
                text_content = _extract_text_content(msg)
                stored_content = _apply_content_mode(
                    text_content, content_mode, max_content_len
                )

                # Aggregate token usage from assistant messages.
                if entry_type == "assistant":
                    usage = msg.get("usage", {})
                    total_input_tokens += usage.get("input_tokens", 0)
                    total_input_tokens += usage.get("cache_read_input_tokens", 0)
                    total_input_tokens += usage.get("cache_creation_input_tokens", 0)
                    total_output_tokens += usage.get("output_tokens", 0)

                # Build message record.
                message_record: dict[str, Any] = {
                    "uuid": uuid,
                    "parent_uuid": parent_uuid,
                    "role": role,
                    "content": stored_content,
                    "full_content": text_content,  # kept for extraction, not stored
                    "timestamp": timestamp,
                    "type": entry_type,
                    "tool_use_ids": [],
                }
                messages.append(message_record)

                # Extract tool_use blocks from assistant messages.
                content_blocks = msg.get("content", [])
                if isinstance(content_blocks, list):
                    for block in content_blocks:
                        if not isinstance(block, dict):
                            continue

                        if block.get("type") == "tool_use":
                            tc = _parse_tool_use(
                                block, timestamp, content_mode, max_content_len
                            )
                            tool_calls.append(tc)
                            message_record["tool_use_ids"].append(tc["tool_use_id"])

                            # Track files.
                            _track_file(
                                tc, files_touched, cwd
                            )

                        elif block.get("type") == "tool_result":
                            tr = _parse_tool_result(block, content_mode, max_content_len)
                            tool_results_by_id[tr["tool_use_id"]] = tr

                            # Track errors.
                            if tr.get("is_error"):
                                errors.append({
                                    "tool_use_id": tr["tool_use_id"],
                                    "message": tr.get("content", "")[:500],
                                    "timestamp": timestamp,
                                })

    except OSError as exc:
        logger.warning("Could not read session file %s: %s", jsonl_path, exc)

    # Match tool results back to tool calls.
    for tc in tool_calls:
        tr = tool_results_by_id.get(tc["tool_use_id"])
        if tr:
            tc["output"] = tr.get("content", "")
            tc["is_error"] = tr.get("is_error", False)

    # Remove full_content from messages (only needed for extraction).
    # Callers that need it (decision/preference extractors) should use
    # the returned dict before this cleanup, or we keep it for now.

    return {
        "session_id": session_id,
        "messages": messages,
        "tool_calls": tool_calls,
        "files_touched": files_touched,
        "errors": errors,
        "progress_count": progress_count,
        "metadata": {
            "git_branch": git_branch,
            "cwd": cwd,
            "version": version,
            "first_timestamp": first_timestamp,
            "last_timestamp": last_timestamp,
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "message_count": len(messages),
        },
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_text_content(msg: dict[str, Any]) -> str:
    """Extract concatenated text from a message's content field."""
    content = msg.get("content", "")
    if isinstance(content, str):
        return content

    parts: list[str] = []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
    return "\n".join(parts)


def _apply_content_mode(text: str, mode: str, max_len: int) -> str:
    """Apply content truncation based on mode."""
    if mode == "none":
        return ""
    if mode == "full":
        return text
    # Default: truncated
    if len(text) > max_len:
        return text[:max_len] + "..."
    return text


def _parse_tool_use(
    block: dict[str, Any],
    timestamp: str,
    content_mode: str,
    max_content_len: int,
) -> dict[str, Any]:
    """Parse a tool_use content block into a tool call record."""
    tool_name = block.get("name", "")
    tool_input = block.get("input", {})
    tool_use_id = block.get("id", "")

    # Build a human-readable input summary.
    input_summary = _summarize_tool_input(tool_name, tool_input)

    return {
        "tool_use_id": tool_use_id,
        "tool_name": tool_name,
        "input": tool_input,
        "input_summary": _apply_content_mode(
            input_summary, content_mode, max_content_len
        ),
        "output": "",  # filled in later from tool_result
        "is_error": False,  # filled in later from tool_result
        "timestamp": timestamp,
    }


def _summarize_tool_input(tool_name: str, tool_input: dict[str, Any]) -> str:
    """Create a short summary of a tool call's input."""
    if tool_name in ("Read", "Write", "Edit", "NotebookEdit"):
        return tool_input.get("file_path", "")
    if tool_name == "Bash":
        cmd = tool_input.get("command", "")
        return cmd[:200] if cmd else ""
    if tool_name in ("Grep", "Glob"):
        pattern = tool_input.get("pattern", "")
        path = tool_input.get("path", "")
        return f"{pattern} in {path}" if path else pattern
    if tool_name == "Agent":
        return tool_input.get("description", tool_input.get("prompt", ""))[:200]
    if tool_name in ("WebSearch", "WebFetch"):
        return tool_input.get("query", tool_input.get("url", ""))[:200]
    # Fallback: serialize input keys.
    return json.dumps(tool_input, default=str)[:200]


def _parse_tool_result(
    block: dict[str, Any],
    content_mode: str,
    max_content_len: int,
) -> dict[str, Any]:
    """Parse a tool_result content block."""
    tool_use_id = block.get("tool_use_id", "")
    is_error = block.get("is_error", False)

    raw_content = block.get("content", "")
    if isinstance(raw_content, list):
        # Content can be a list of text blocks.
        parts = []
        for item in raw_content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
            elif isinstance(item, str):
                parts.append(item)
        raw_content = "\n".join(parts)

    stored = _apply_content_mode(str(raw_content), content_mode, max_content_len)

    return {
        "tool_use_id": tool_use_id,
        "content": stored,
        "is_error": is_error,
    }


def _track_file(
    tool_call: dict[str, Any],
    files: dict[str, dict[str, Any]],
    session_cwd: str,
) -> None:
    """Extract file paths from a tool call and update the files dict."""
    tool_name = tool_call["tool_name"]
    tool_input = tool_call.get("input", {})

    paths: list[str] = []
    operation = "read"

    if tool_name in _WRITE_TOOLS:
        path = tool_input.get("file_path", "")
        if path:
            paths.append(path)
        operation = "write"
    elif tool_name in _READ_TOOLS:
        path = tool_input.get("file_path", "") or tool_input.get("path", "")
        if path:
            paths.append(path)
        operation = "read"
    elif tool_name == "Bash":
        # Try to extract file paths from bash commands.
        cmd = tool_input.get("command", "")
        for match in _BASH_FILE_RE.finditer(cmd):
            paths.append(match.group(1))
        operation = "execute"

    for path in paths:
        # Normalise relative paths against session cwd.
        if not os.path.isabs(path) and session_cwd:
            path = os.path.normpath(os.path.join(session_cwd, path))

        if path not in files:
            ext = os.path.splitext(path)[1].lstrip(".")
            files[path] = {
                "path": path,
                "language": _ext_to_language(ext),
                "modification_count": 0,
                "read_count": 0,
            }

        if operation == "write":
            files[path]["modification_count"] += 1
        elif operation == "read":
            files[path]["read_count"] += 1


def _ext_to_language(ext: str) -> str:
    """Map file extension to a language name."""
    mapping = {
        "py": "python",
        "js": "javascript",
        "jsx": "javascript",
        "ts": "typescript",
        "tsx": "typescript",
        "rs": "rust",
        "go": "go",
        "java": "java",
        "rb": "ruby",
        "yml": "yaml",
        "yaml": "yaml",
        "json": "json",
        "md": "markdown",
        "sh": "shell",
        "bash": "shell",
        "zsh": "shell",
        "css": "css",
        "html": "html",
        "sql": "sql",
        "toml": "toml",
        "cfg": "config",
        "ini": "config",
        "env": "config",
        "j2": "jinja2",
    }
    return mapping.get(ext.lower(), ext.lower() or "unknown")

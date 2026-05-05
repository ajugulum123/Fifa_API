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

"""Zip file extraction and format auto-detection for chat exports."""

from __future__ import annotations

import io
import json
import logging
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Known filenames inside export zip archives
CLAUDE_AI_FILENAME = "conversations.jsonl"
CHATGPT_FILENAME = "conversations.json"
# Maximum number of filenames to display in error messages.
_MAX_DISPLAYED_FILES = 10


def detect_format(path: str | Path) -> str:
    """Detect whether a file is a Claude AI or ChatGPT export.

    Args:
        path: Path to .zip, .json, or .jsonl file.

    Returns:
        ``"claude-ai"`` or ``"chatgpt"``.

    Raises:
        ValueError: If the format cannot be determined.
    """
    path = Path(path)

    if path.suffix == ".jsonl":
        return "claude-ai"
    if path.suffix == ".json":
        return "chatgpt"

    if path.suffix == ".zip":
        with zipfile.ZipFile(path, "r") as zf:
            names = zf.namelist()
            if CLAUDE_AI_FILENAME in names:
                return "claude-ai"
            if CHATGPT_FILENAME in names:
                return "chatgpt"
            raise ValueError(
                f"Zip file does not contain {CLAUDE_AI_FILENAME} or "
                f"{CHATGPT_FILENAME}. Found: {names[:_MAX_DISPLAYED_FILES]}"
            )

    raise ValueError(
        f"Unsupported file type: {path.suffix}. "
        "Expected .zip, .json, or .jsonl"
    )


def stream_jsonl(path: str | Path) -> Iterator[dict[str, Any]]:
    """Stream JSON objects line-by-line from a ``.jsonl`` file or zip.

    For zip files, extracts ``conversations.jsonl`` and iterates lines
    without loading the entire file into memory.

    Malformed lines are logged and skipped.

    Args:
        path: Path to ``.jsonl`` file or ``.zip`` containing one.

    Yields:
        Parsed JSON objects, one per JSONL line.
    """
    path = Path(path)

    if path.suffix == ".zip":
        with zipfile.ZipFile(path, "r") as zf:
            try:
                f_entry = zf.open(CLAUDE_AI_FILENAME)
            except KeyError:
                raise ValueError(
                    f"Zip archive does not contain '{CLAUDE_AI_FILENAME}'. "
                    f"Found: {zf.namelist()[:_MAX_DISPLAYED_FILES]}"
                )
            with f_entry as f:
                reader = io.TextIOWrapper(f, encoding="utf-8")
                yield from _iter_jsonl_lines(reader)
    else:
        with open(path, encoding="utf-8") as f:
            yield from _iter_jsonl_lines(f)


def read_json(path: str | Path) -> list[dict[str, Any]]:
    """Read a JSON array from a ``.json`` file or zip.

    For zip files, extracts ``conversations.json``.

    Args:
        path: Path to ``.json`` file or ``.zip`` containing one.

    Returns:
        Parsed JSON array (list of conversation dicts).

    Raises:
        ValueError: If the JSON is not an array.
    """
    path = Path(path)

    if path.suffix == ".zip":
        with zipfile.ZipFile(path, "r") as zf:
            try:
                f_entry = zf.open(CHATGPT_FILENAME)
            except KeyError:
                raise ValueError(
                    f"Zip archive does not contain '{CHATGPT_FILENAME}'. "
                    f"Found: {zf.namelist()[:_MAX_DISPLAYED_FILES]}"
                )
            with f_entry as f:
                data = json.load(f)
    else:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)

    if not isinstance(data, list):
        raise ValueError(
            f"Expected a JSON array, got {type(data).__name__}"
        )
    return data


def _iter_jsonl_lines(reader: io.TextIOWrapper | io.StringIO) -> Iterator[dict[str, Any]]:
    """Iterate over JSONL lines, skipping malformed ones."""
    for line_num, line in enumerate(reader, start=1):
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError as e:
            logger.warning("Skipping malformed JSONL line %d: %s", line_num, e)

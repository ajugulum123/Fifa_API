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

"""Claude AI conversation export parser.

Parses ``conversations.jsonl`` from the Claude AI data export
(Settings > Account > Export Data).  Each line is a JSON object
representing one conversation.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from create_context_graph.connectors._chat_import.models import (
    ParsedConversation,
    ParsedMessage,
)
from create_context_graph.connectors._chat_import.zip_reader import stream_jsonl

logger = logging.getLogger(__name__)

# Sender value in Claude AI export -> normalized role
_ROLE_MAP: dict[str, str] = {
    "human": "user",
    "assistant": "assistant",
}


def parse_conversations(
    source: str | Path,
    *,
    filter_after: datetime | None = None,
    filter_before: datetime | None = None,
    filter_title: str | None = None,
    max_conversations: int = 0,
) -> list[ParsedConversation]:
    """Parse Claude AI conversations from a ``.jsonl`` file or zip.

    Args:
        source: Path to ``.zip`` or ``.jsonl`` file.
        filter_after: Only include conversations created after this datetime.
        filter_before: Only include conversations created before this datetime.
        filter_title: Regex pattern to filter conversation titles.
        max_conversations: Maximum conversations to return (0 = unlimited).

    Returns:
        List of parsed conversations.
    """
    title_re = re.compile(filter_title, re.IGNORECASE) if filter_title else None

    conversations: list[ParsedConversation] = []
    skipped = 0

    for raw in stream_jsonl(source):
        try:
            conv = _parse_single_conversation(raw)
        except (KeyError, TypeError, ValueError) as exc:
            skipped += 1
            logger.warning("Skipping malformed conversation: %s", exc)
            continue

        # Apply filters
        if filter_after and conv.created_at < filter_after:
            continue
        if filter_before and conv.created_at > filter_before:
            continue
        if title_re and not title_re.search(conv.title):
            continue

        conversations.append(conv)

        if max_conversations and len(conversations) >= max_conversations:
            break

    if skipped:
        logger.info("Skipped %d malformed conversations", skipped)

    return conversations


def _parse_single_conversation(raw: dict[str, Any]) -> ParsedConversation:
    """Parse one conversation JSON object into a ``ParsedConversation``."""
    conversation_id = raw["uuid"]
    title = raw.get("name") or "Untitled"
    created_at = _parse_timestamp(raw["created_at"])
    updated_at = _parse_timestamp(raw["updated_at"])

    messages: list[ParsedMessage] = []
    for msg_raw in raw.get("chat_messages", []):
        msg = _parse_message(msg_raw)
        if msg is not None:
            messages.append(msg)

    metadata: dict[str, Any] = {}
    if raw.get("account"):
        metadata["account_uuid"] = raw["account"].get("uuid")

    return ParsedConversation(
        source="claude-ai",
        conversation_id=conversation_id,
        title=title,
        created_at=created_at,
        updated_at=updated_at,
        messages=messages,
        metadata=metadata,
    )


def _parse_message(raw: dict[str, Any]) -> ParsedMessage | None:
    """Parse one message dict from a Claude AI conversation.

    Returns ``None`` if the message should be skipped (unknown sender).
    """
    sender = raw.get("sender", "")
    role = _ROLE_MAP.get(sender)
    if role is None:
        logger.debug("Skipping message with unknown sender: %s", sender)
        return None

    message_id = raw.get("uuid", "")
    created_at = _parse_timestamp(raw["created_at"]) if raw.get("created_at") else None

    # Extract content from structured content blocks or fallback to text field
    content_blocks = raw.get("content", [])
    text_parts: list[str] = []
    tool_calls: list[dict[str, Any]] = []
    tool_results: list[dict[str, Any]] = []
    thinking: str | None = None

    if isinstance(content_blocks, list):
        for block in content_blocks:
            if not isinstance(block, dict):
                continue
            block_type = block.get("type", "")

            if block_type == "text":
                text = block.get("text", "")
                if text:
                    text_parts.append(text)
            elif block_type == "tool_use":
                tool_calls.append({
                    "name": block.get("name", ""),
                    "id": block.get("id", ""),
                    "input": block.get("input", {}),
                })
            elif block_type == "tool_result":
                tool_results.append({
                    "tool_use_id": block.get("tool_use_id", ""),
                    "content": block.get("content", ""),
                })
            elif block_type == "thinking":
                thinking = block.get("thinking", "")

    # Use the top-level text field as fallback
    content = "\n".join(text_parts) if text_parts else raw.get("text", "")

    metadata: dict[str, Any] = {}
    if raw.get("attachments"):
        metadata["attachment_count"] = len(raw["attachments"])
    if raw.get("files"):
        metadata["file_count"] = len(raw["files"])

    return ParsedMessage(
        message_id=message_id,
        role=role,
        content=content,
        created_at=created_at,
        tool_calls=tool_calls,
        tool_results=tool_results,
        thinking=thinking,
        metadata=metadata,
    )


def _parse_timestamp(value: str | None) -> datetime:
    """Parse an ISO 8601 timestamp string to a UTC datetime."""
    if not value:
        return datetime.now(timezone.utc)

    # Python's fromisoformat handles most ISO 8601 strings
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        # Fallback: strip microseconds beyond 6 digits
        dt = datetime.fromisoformat(value[:26].rstrip("0").rstrip(".") + value[26:])

    # Ensure timezone-aware (assume UTC if naive)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    return dt

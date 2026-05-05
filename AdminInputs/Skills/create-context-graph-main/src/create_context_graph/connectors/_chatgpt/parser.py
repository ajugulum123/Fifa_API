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

"""ChatGPT conversation export parser.

Parses ``conversations.json`` from the ChatGPT data export
(Settings > Data Controls > Export Data).  The file is a JSON array
where each element is a conversation with a tree-structured ``mapping``
field that must be walked to reconstruct the linear message sequence.
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
from create_context_graph.connectors._chat_import.zip_reader import read_json

logger = logging.getLogger(__name__)

# Author roles to include in the parsed output
_INCLUDE_ROLES = {"user", "assistant", "tool"}


def parse_conversations(
    source: str | Path,
    *,
    filter_after: datetime | None = None,
    filter_before: datetime | None = None,
    filter_title: str | None = None,
    max_conversations: int = 0,
) -> list[ParsedConversation]:
    """Parse ChatGPT conversations from a ``.json`` file or zip.

    Args:
        source: Path to ``.zip`` or ``.json`` file.
        filter_after: Only include conversations created after this datetime.
        filter_before: Only include conversations created before this datetime.
        filter_title: Regex pattern to filter conversation titles.
        max_conversations: Maximum conversations to return (0 = unlimited).

    Returns:
        List of parsed conversations.
    """
    raw_conversations = read_json(source)
    title_re = re.compile(filter_title, re.IGNORECASE) if filter_title else None

    conversations: list[ParsedConversation] = []
    skipped = 0

    for raw in raw_conversations:
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
    """Parse one conversation dict into a ``ParsedConversation``."""
    conversation_id = raw["conversation_id"]
    title = raw.get("title") or "Untitled"
    created_at = _unix_to_datetime(raw.get("create_time"))
    updated_at = _unix_to_datetime(raw.get("update_time"))

    mapping = raw.get("mapping", {})
    messages = _walk_message_tree(mapping)

    metadata: dict[str, Any] = {}
    if raw.get("default_model_slug"):
        metadata["model_slug"] = raw["default_model_slug"]

    return ParsedConversation(
        source="chatgpt",
        conversation_id=conversation_id,
        title=title,
        created_at=created_at,
        updated_at=updated_at,
        messages=messages,
        metadata=metadata,
    )


def _walk_message_tree(mapping: dict[str, Any]) -> list[ParsedMessage]:
    """Reconstruct a linear message list from a ChatGPT message tree.

    ChatGPT stores messages in a tree structure where each node has
    ``parent`` and ``children`` references.  At branch points (multiple
    children), we follow the **last** child to get the main conversation
    path.

    Messages with ``is_visually_hidden_from_conversation: true`` and
    ``system`` role messages are filtered out.
    """
    if not mapping:
        return []

    # Find root nodes (parent is None)
    roots = [
        node_id
        for node_id, node in mapping.items()
        if node.get("parent") is None
    ]

    if not roots:
        return []

    # Walk from root following children, collecting messages
    messages: list[ParsedMessage] = []
    current_id: str | None = roots[0]

    while current_id is not None:
        node = mapping.get(current_id)
        if node is None:
            break

        msg = _parse_node_message(node)
        if msg is not None:
            messages.append(msg)

        # Follow last child at branch points
        children = node.get("children", [])
        current_id = children[-1] if children else None

    return messages


def _parse_node_message(node: dict[str, Any]) -> ParsedMessage | None:
    """Extract a ``ParsedMessage`` from a tree node, or ``None`` to skip."""
    msg_data = node.get("message")
    if msg_data is None:
        return None

    # Skip hidden messages
    metadata_raw = msg_data.get("metadata") or {}
    if metadata_raw.get("is_visually_hidden_from_conversation"):
        return None

    author = msg_data.get("author") or {}
    role = author.get("role", "")

    # Skip system messages
    if role == "system" or role not in _INCLUDE_ROLES:
        return None

    message_id = msg_data.get("id", node.get("id", ""))
    created_at = _unix_to_datetime(msg_data.get("create_time"))

    # Extract text content
    content_obj = msg_data.get("content") or {}
    content_type = content_obj.get("content_type", "text")
    parts = content_obj.get("parts", [])

    text_parts: list[str] = []
    tool_calls: list[dict[str, Any]] = []
    tool_results: list[dict[str, Any]] = []

    if content_type in ("text", "code"):
        for part in parts:
            if isinstance(part, str) and part.strip():
                text_parts.append(part)
    elif content_type == "execution_output":
        # Code Interpreter output
        for part in parts:
            if isinstance(part, str) and part.strip():
                tool_results.append({"content": part, "type": "execution_output"})
    elif content_type == "multimodal_text":
        # DALL-E or image content — extract text parts only
        for part in parts:
            if isinstance(part, str) and part.strip():
                text_parts.append(part)

    content = "\n".join(text_parts)

    # For tool-role messages, store as tool result
    if role == "tool" and content:
        tool_results.append({"content": content, "type": content_type})

    # Extract model slug from metadata
    msg_metadata: dict[str, Any] = {}
    model_slug = metadata_raw.get("model_slug")
    if model_slug:
        msg_metadata["model_slug"] = model_slug

    return ParsedMessage(
        message_id=message_id,
        role=role if role != "tool" else "tool",
        content=content,
        created_at=created_at,
        tool_calls=tool_calls,
        tool_results=tool_results,
        thinking=None,
        metadata=msg_metadata,
    )


def _unix_to_datetime(timestamp: float | int | None) -> datetime:
    """Convert a Unix timestamp (seconds since epoch) to a UTC datetime."""
    if timestamp is None or timestamp == 0:
        return datetime.now(timezone.utc)

    return datetime.fromtimestamp(float(timestamp), tz=timezone.utc)

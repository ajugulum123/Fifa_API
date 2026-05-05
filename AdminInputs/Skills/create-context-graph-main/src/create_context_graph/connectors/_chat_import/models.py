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

"""Shared data models for chat history import (Claude AI, ChatGPT)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal


@dataclass
class ParsedMessage:
    """A single message extracted from a chat export."""

    message_id: str
    role: Literal["user", "assistant", "system", "tool"]
    content: str
    created_at: datetime | None = None
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    tool_results: list[dict[str, Any]] = field(default_factory=list)
    thinking: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedConversation:
    """A single conversation extracted from a chat export."""

    source: Literal["claude-ai", "chatgpt"]
    conversation_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[ParsedMessage] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

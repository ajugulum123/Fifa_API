r"""
 __  __                           _
|  \/  | ___ _ __ ___   ___  _ __(_)
| |\/| |/ _ \ '_ ` _ \ / _ \| '__| |
| |  | |  __/ | | | | | (_) | |  | |
|_|  |_|\___|_| |_| |_|\___/|_|  |_|
                  perfectam memoriam
                       memorilabs.ai
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any


def prepare_text_inputs(texts: str | Iterable[str]) -> list[str]:
    if isinstance(texts, str):
        return [texts]
    return [t for t in texts if t]


def embedding_dimension(model: Any, default: int) -> int:
    try:
        dim_value = model.get_sentence_embedding_dimension()
        return int(dim_value) if dim_value is not None else default
    except (RuntimeError, ValueError, AttributeError, TypeError):
        return default


def zero_vectors(count: int, dim: int) -> list[list[float]]:
    return [[0.0] * dim for _ in range(count)]

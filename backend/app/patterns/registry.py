from __future__ import annotations

from collections.abc import Callable
from typing import Any

Method = Callable[[dict[str, Any], dict[str, Any]], Any]

_METHODS: dict[str, Method] = {}


def register(kind: str):
    def deco(fn: Method) -> Method:
        _METHODS[kind] = fn
        return fn

    return deco


def method_for(kind: str) -> Method:
    try:
        return _METHODS[kind]
    except KeyError as exc:
        raise KeyError(kind) from exc

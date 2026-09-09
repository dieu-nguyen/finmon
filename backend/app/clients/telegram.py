from __future__ import annotations

from typing import Any

import httpx


class TelegramSender:
    def __init__(self, token: str, chat_id: str, transport: httpx.BaseTransport | None = None) -> None:
        self.token = token
        self.chat_id = chat_id
        self._client = httpx.Client(timeout=20.0, transport=transport)

    def configured(self) -> bool:
        return bool(self.token and self.chat_id)

    def send(self, text: str) -> bool:
        if not self.configured():
            return False
        resp = self._client.post(
            f"https://api.telegram.org/bot{self.token}/sendMessage",
            json={"chat_id": self.chat_id, "text": text},
        )
        return resp.status_code == 200

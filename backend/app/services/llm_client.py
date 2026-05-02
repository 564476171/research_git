import json

import httpx


class LLMError(Exception):
    pass


class LLMClient:
    """OpenAI-compatible chat + embeddings client."""

    def __init__(self, base_url: str, api_key: str, model: str, embedding_model: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.embedding_model = embedding_model

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def chat(self, messages: list[dict], max_tokens: int = 512) -> str:
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(url, headers=self._headers, json=payload)
            if r.status_code != 200:
                raise LLMError(f"chat failed {r.status_code}: {r.text[:300]}")
            data = r.json()
        return data["choices"][0]["message"]["content"]

    async def stream_chat(self, messages: list[dict], max_tokens: int = 512):
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", url, headers=self._headers, json=payload) as r:
                if r.status_code != 200:
                    body = await r.aread()
                    raise LLMError(f"chat failed {r.status_code}: {body.decode('utf-8', 'ignore')[:300]}")
                async for line in r.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line.removeprefix("data:").strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    choices = chunk.get("choices") or []
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {}).get("content")
                    if delta:
                        yield delta

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.embedding_model:
            raise LLMError("embedding_model is not configured for this model config")
        url = f"{self.base_url}/embeddings"
        payload = {"model": self.embedding_model, "input": texts}
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(url, headers=self._headers, json=payload)
            if r.status_code != 200:
                raise LLMError(f"embeddings failed {r.status_code}: {r.text[:300]}")
            data = r.json()
        return [item["embedding"] for item in data["data"]]

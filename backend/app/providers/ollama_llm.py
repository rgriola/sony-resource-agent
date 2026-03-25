from typing import AsyncIterator
import httpx
from app.providers.base import LLMProvider


class OllamaLLM(LLMProvider):
    """Adapter for Ollama running locally (OpenAI-compatible API)."""

    def __init__(self, settings):
        self.base_url = settings.CUSTOM_LLM_ENDPOINT or "http://localhost:11434"
        self.model = settings.LLM_MODEL

    def _build_context(self, context_chunks: list[dict]) -> str:
        return "\n\n---\n\n".join(
            f"[Page {c.get('page', '?')}, "
            f"Section: {c.get('section', 'N/A')}]\n{c.get('text', '')}"
            for c in context_chunks
        )

    async def generate(
        self, system_prompt: str, user_message: str, context_chunks: list[dict]
    ) -> str:
        context_text = self._build_context(context_chunks)
        full_system = f"{system_prompt}\n\nCONTEXT FROM MANUAL:\n---\n{context_text}\n---"
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": full_system},
                        {"role": "user", "content": user_message},
                    ],
                    "stream": False,
                },
            )
            resp.raise_for_status()
            return resp.json()["message"]["content"]

    async def generate_stream(
        self, system_prompt: str, user_message: str, context_chunks: list[dict]
    ) -> AsyncIterator[str]:
        import json as _json

        context_text = self._build_context(context_chunks)
        full_system = f"{system_prompt}\n\nCONTEXT FROM MANUAL:\n---\n{context_text}\n---"
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": full_system},
                        {"role": "user", "content": user_message},
                    ],
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line:
                        data = _json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            yield content

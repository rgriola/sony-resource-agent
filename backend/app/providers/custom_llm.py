from typing import AsyncIterator
import httpx
from app.providers.base import LLMProvider


class CustomLLM(LLMProvider):
    """Generic adapter for any OpenAI-compatible API endpoint."""

    def __init__(self, settings):
        self.endpoint = settings.CUSTOM_LLM_ENDPOINT
        self.api_key = settings.CUSTOM_LLM_API_KEY
        self.model = settings.LLM_MODEL
        if not self.endpoint:
            raise ValueError(
                "CUSTOM_LLM_ENDPOINT must be set when using the 'custom' LLM provider."
            )

    def _headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _build_body(
        self,
        system_prompt: str,
        user_message: str,
        context_chunks: list[dict],
        stream: bool = False,
    ) -> dict:
        context_text = "\n\n---\n\n".join(
            f"[Page {c.get('page', '?')}, "
            f"Section: {c.get('section', 'N/A')}]\n{c.get('text', '')}"
            for c in context_chunks
        )
        full_system = f"{system_prompt}\n\nCONTEXT FROM MANUAL:\n---\n{context_text}\n---"
        return {
            "model": self.model,
            "messages": [
                {"role": "system", "content": full_system},
                {"role": "user", "content": user_message},
            ],
            "stream": stream,
        }

    async def generate(
        self, system_prompt: str, user_message: str, context_chunks: list[dict]
    ) -> str:
        body = self._build_body(system_prompt, user_message, context_chunks)
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                self.endpoint, json=body, headers=self._headers()
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    async def generate_stream(
        self, system_prompt: str, user_message: str, context_chunks: list[dict]
    ) -> AsyncIterator[str]:
        import json as _json

        body = self._build_body(system_prompt, user_message, context_chunks, stream=True)
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST", self.endpoint, json=body, headers=self._headers()
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        data = _json.loads(data_str)
                        content = (
                            data.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content", "")
                        )
                        if content:
                            yield content

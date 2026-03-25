from typing import AsyncIterator
import anthropic
from app.providers.base import LLMProvider


class AnthropicLLM(LLMProvider):
    def __init__(self, settings):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
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
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=full_system,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    async def generate_stream(
        self, system_prompt: str, user_message: str, context_chunks: list[dict]
    ) -> AsyncIterator[str]:
        context_text = self._build_context(context_chunks)
        full_system = f"{system_prompt}\n\nCONTEXT FROM MANUAL:\n---\n{context_text}\n---"
        async with self.client.messages.stream(
            model=self.model,
            max_tokens=4096,
            system=full_system,
            messages=[{"role": "user", "content": user_message}],
        ) as stream:
            async for text in stream.text_stream:
                yield text

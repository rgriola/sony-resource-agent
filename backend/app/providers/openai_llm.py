from typing import AsyncIterator
import openai
from app.providers.base import LLMProvider


class OpenAILLM(LLMProvider):
    def __init__(self, settings):
        self.client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = settings.LLM_MODEL

    def _build_messages(
        self, system_prompt: str, user_message: str, context_chunks: list[dict]
    ) -> list[dict]:
        context_text = "\n\n---\n\n".join(
            f"[Page {c.get('page', '?')}, "
            f"Section: {c.get('section', 'N/A')}]\n{c.get('text', '')}"
            for c in context_chunks
        )
        full_system = f"{system_prompt}\n\nCONTEXT FROM MANUAL:\n---\n{context_text}\n---"
        return [
            {"role": "system", "content": full_system},
            {"role": "user", "content": user_message},
        ]

    async def generate(
        self, system_prompt: str, user_message: str, context_chunks: list[dict]
    ) -> str:
        messages = self._build_messages(system_prompt, user_message, context_chunks)
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
        )
        return response.choices[0].message.content

    async def generate_stream(
        self, system_prompt: str, user_message: str, context_chunks: list[dict]
    ) -> AsyncIterator[str]:
        messages = self._build_messages(system_prompt, user_message, context_chunks)
        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

"""
Generation module — build prompts, call LLM, stream responses.
"""

from typing import AsyncIterator
from app.providers.registry import get_llm
from app.retrieval import retrieve_chunks

DEFAULT_SYSTEM_PROMPT = """You are an expert technical assistant for the product described in the provided instruction manual.

RULES:
- Answer questions using ONLY the manual excerpts provided below as context.
- Always cite your sources using the format [Page X, Section Y].
- If multiple sections are relevant, reference all of them.
- If the manual does not contain enough information to answer the question, say:
  "I couldn't find this information in the manual. The closest related topic is [topic] on page [X]."
- Never fabricate information that isn't in the provided context.
- Use clear, concise language appropriate for someone following an instruction manual.
- When describing procedures, use numbered steps.
- If the question is ambiguous, ask a clarifying question before answering."""


async def generate_answer(
    question: str,
    system_prompt: str | None = None,
    top_k: int | None = None,
    source_filter: str | None = None,
) -> tuple[str, list[dict]]:
    """Retrieve context and generate a complete answer. Returns (answer, sources)."""
    system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
    chunks = await retrieve_chunks(question, top_k=top_k, source_filter=source_filter)
    llm = get_llm()
    answer = await llm.generate(system_prompt, question, chunks)
    return answer, chunks


async def generate_answer_stream(
    question: str,
    system_prompt: str | None = None,
    top_k: int | None = None,
    source_filter: str | None = None,
) -> tuple[AsyncIterator[str], list[dict]]:
    """Retrieve context and stream the answer. Returns (token_iterator, sources)."""
    system_prompt = system_prompt or DEFAULT_SYSTEM_PROMPT
    chunks = await retrieve_chunks(question, top_k=top_k, source_filter=source_filter)
    llm = get_llm()
    token_stream = llm.generate_stream(system_prompt, question, chunks)
    return token_stream, chunks

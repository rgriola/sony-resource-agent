"""
Retrieval module — embed query, search vector store, return ranked chunks.
"""

from app.config import settings
from app.providers.registry import get_embedder, get_vector_store


async def retrieve_chunks(
    query: str,
    top_k: int | None = None,
    source_filter: str | None = None,
) -> list[dict]:
    """Embed the query and search the vector store for the most relevant chunks."""
    top_k = top_k or settings.TOP_K_RETRIEVAL
    embedder = get_embedder()
    query_embedding = (await embedder.embed([query]))[0]

    store = get_vector_store()
    results = await store.search(query_embedding, top_k=top_k, source_filter=source_filter)
    return results

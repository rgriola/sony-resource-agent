from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMProvider(ABC):
    """Interface every LLM adapter must implement."""

    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        user_message: str,
        context_chunks: list[dict],
    ) -> str:
        """Return a complete response string."""
        ...

    @abstractmethod
    async def generate_stream(
        self,
        system_prompt: str,
        user_message: str,
        context_chunks: list[dict],
    ) -> AsyncIterator[str]:
        """Yield response tokens one at a time."""
        ...


class EmbeddingProvider(ABC):
    """Interface every embedding adapter must implement."""

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Return a list of embedding vectors, one per input text."""
        ...

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Dimensionality of the embedding vectors."""
        ...


class VectorStoreProvider(ABC):
    """Interface every vector store adapter must implement."""

    @abstractmethod
    async def add(
        self,
        embeddings: list[list[float]],
        metadata: list[dict],
    ) -> None:
        """Add embedded chunks with metadata to the store."""
        ...

    @abstractmethod
    async def delete_collection(self, name: str) -> None:
        """Delete a named collection from the store."""
        ...

    @abstractmethod
    async def list_documents(self) -> list[dict]:
        """Return a list of unique source_file names with chunk counts."""
        ...

    @abstractmethod
    async def delete_by_source(self, source_file: str) -> int:
        """Delete all chunks from a specific source file. Returns count deleted."""
        ...

    @abstractmethod
    async def search(
        self,
        query_embedding: list[float],
        top_k: int = 5,
        source_filter: str | None = None,
    ) -> list[dict]:
        """Return top_k most similar chunks, optionally filtered by source_file."""
        ...

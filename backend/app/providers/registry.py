"""
Provider Registry — discovers and loads the active provider at startup.

Usage:
    from app.providers.registry import get_llm, get_embedder, get_vector_store
    llm = get_llm()
    embedder = get_embedder()
    store = get_vector_store()
"""

import importlib
from app.providers.base import LLMProvider, EmbeddingProvider, VectorStoreProvider
from app.config import settings


_PROVIDERS: dict[str, dict[str, str]] = {
    "llm": {
        "openai": "app.providers.openai_llm.OpenAILLM",
        "anthropic": "app.providers.anthropic_llm.AnthropicLLM",
        "ollama": "app.providers.ollama_llm.OllamaLLM",
        "custom": "app.providers.custom_llm.CustomLLM",
    },
    "embedding": {
        "openai": "app.providers.openai_embedding.OpenAIEmbedding",
        "huggingface": "app.providers.hf_embedding.HuggingFaceEmbedding",
    },
    "vector_store": {
        "faiss": "app.providers.faiss_store.FAISSStore",
        "chroma": "app.providers.chroma_store.ChromaStore",
    },
}

# Cached singleton instances
_instances: dict[str, object] = {}


def _import_class(dotted_path: str) -> type:
    module_path, class_name = dotted_path.rsplit(".", 1)
    module = importlib.import_module(module_path)
    return getattr(module, class_name)


def get_llm(*, refresh: bool = False) -> LLMProvider:
    if refresh or "llm" not in _instances:
        provider_name = settings.LLM_PROVIDER.lower()
        if provider_name not in _PROVIDERS["llm"]:
            raise ValueError(
                f"Unknown LLM provider '{provider_name}'. "
                f"Available: {list(_PROVIDERS['llm'].keys())}"
            )
        cls = _import_class(_PROVIDERS["llm"][provider_name])
        _instances["llm"] = cls(settings)
    return _instances["llm"]


def get_embedder(*, refresh: bool = False) -> EmbeddingProvider:
    if refresh or "embedding" not in _instances:
        provider_name = settings.EMBEDDING_PROVIDER.lower()
        if provider_name not in _PROVIDERS["embedding"]:
            raise ValueError(
                f"Unknown embedding provider '{provider_name}'. "
                f"Available: {list(_PROVIDERS['embedding'].keys())}"
            )
        cls = _import_class(_PROVIDERS["embedding"][provider_name])
        _instances["embedding"] = cls(settings)
    return _instances["embedding"]


def get_vector_store(*, refresh: bool = False) -> VectorStoreProvider:
    if refresh or "vector_store" not in _instances:
        provider_name = settings.VECTOR_STORE_PROVIDER.lower()
        if provider_name not in _PROVIDERS["vector_store"]:
            raise ValueError(
                f"Unknown vector store provider '{provider_name}'. "
                f"Available: {list(_PROVIDERS['vector_store'].keys())}"
            )
        cls = _import_class(_PROVIDERS["vector_store"][provider_name])
        _instances["vector_store"] = cls(settings)
    return _instances["vector_store"]


def list_providers() -> dict[str, list[str]]:
    """Return available provider names grouped by type."""
    return {ptype: list(providers.keys()) for ptype, providers in _PROVIDERS.items()}


def get_active_config() -> dict:
    """Return the active provider configuration (keys redacted)."""
    return {
        "llm_provider": settings.LLM_PROVIDER,
        "llm_model": settings.LLM_MODEL,
        "embedding_provider": settings.EMBEDDING_PROVIDER,
        "embedding_model": settings.EMBEDDING_MODEL,
        "vector_store_provider": settings.VECTOR_STORE_PROVIDER,
    }

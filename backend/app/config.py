from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # --- Provider selection ---
    LLM_PROVIDER: str = "openai"  # openai | anthropic | ollama | custom
    LLM_MODEL: str = "gpt-4o"
    EMBEDDING_PROVIDER: str = "openai"  # openai | huggingface
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    VECTOR_STORE_PROVIDER: str = "faiss"  # faiss | chroma

    # --- API keys (set only the ones you use) ---
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None

    # --- Custom / self-hosted provider ---
    CUSTOM_LLM_ENDPOINT: Optional[str] = None
    CUSTOM_LLM_API_KEY: Optional[str] = None
    CUSTOM_EMBEDDING_ENDPOINT: Optional[str] = None

    # --- PDF source folder (auto-scan) ---
    PDF_SOURCE_FOLDER: str = "../pdfs"
    AUTO_SCAN_ON_STARTUP: bool = True
    SCAN_POLL_INTERVAL_SECONDS: int = 30  # 0 to disable polling

    # --- Ingestion ---
    CHUNK_SIZE: int = 400
    CHUNK_OVERLAP: int = 50

    # --- Retrieval ---
    TOP_K_RETRIEVAL: int = 8
    TOP_K_AFTER_RERANK: int = 4
    VECTOR_STORE_PATH: str = "./data/faiss_index"

    # --- Server ---
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()

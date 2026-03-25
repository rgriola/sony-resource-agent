from pydantic import BaseModel


class QueryRequest(BaseModel):
    question: str
    system_prompt: str | None = None
    top_k: int | None = None
    source_filter: str | None = None  # restrict query to a specific PDF


class QueryResponse(BaseModel):
    answer: str
    sources: list[dict]


class IngestionResponse(BaseModel):
    pages_extracted: int
    chunks_created: int
    source_file: str


class ProviderConfig(BaseModel):
    llm_provider: str | None = None
    llm_model: str | None = None
    embedding_provider: str | None = None
    embedding_model: str | None = None
    vector_store_provider: str | None = None
    api_key: str | None = None  # for runtime key updates

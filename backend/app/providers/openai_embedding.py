import openai
from app.providers.base import EmbeddingProvider


class OpenAIEmbedding(EmbeddingProvider):
    def __init__(self, settings):
        self.client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = settings.EMBEDDING_MODEL
        self._dimension = 1536 if "small" in self.model else 3072

    async def embed(self, texts: list[str]) -> list[list[float]]:
        # OpenAI limits to 2048 items per request
        BATCH_SIZE = 2048
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i : i + BATCH_SIZE]
            response = await self.client.embeddings.create(
                model=self.model,
                input=batch,
            )
            all_embeddings.extend(item.embedding for item in response.data)
        return all_embeddings

    @property
    def dimension(self) -> int:
        return self._dimension

from sentence_transformers import SentenceTransformer
from app.providers.base import EmbeddingProvider


class HuggingFaceEmbedding(EmbeddingProvider):
    def __init__(self, settings):
        self.model_name = settings.EMBEDDING_MODEL
        self._model = SentenceTransformer(self.model_name)
        self._dimension = self._model.get_sentence_embedding_dimension()

    async def embed(self, texts: list[str]) -> list[list[float]]:
        # sentence-transformers is sync; run in default executor
        embeddings = self._model.encode(texts, normalize_embeddings=True)
        return embeddings.tolist()

    @property
    def dimension(self) -> int:
        return self._dimension

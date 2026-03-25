import chromadb
from app.providers.base import VectorStoreProvider


class ChromaStore(VectorStoreProvider):
    COLLECTION_NAME = "pdf_manual"

    def __init__(self, settings):
        self._client = chromadb.PersistentClient(path=settings.VECTOR_STORE_PATH)
        self._collection = self._client.get_or_create_collection(
            name=self.COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    async def add(
        self, embeddings: list[list[float]], metadata: list[dict]
    ) -> None:
        ids = [
            f"{m.get('source_file', 'doc')}_{m.get('page', 0)}_{m.get('chunk_index', i)}"
            for i, m in enumerate(metadata)
        ]
        documents = [m.pop("text", "") for m in metadata]
        self._collection.add(
            ids=ids,
            embeddings=embeddings,
            metadatas=metadata,
            documents=documents,
        )

    async def search(
        self, query_embedding: list[float], top_k: int = 5,
        source_filter: str | None = None,
    ) -> list[dict]:
        where_filter = {"source_file": source_filter} if source_filter else None
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )
        if not results["documents"] or not results["documents"][0]:
            return []
        output = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            output.append({**meta, "text": doc, "score": float(dist)})
        return output

    async def list_documents(self) -> list[dict]:
        all_meta = self._collection.get(include=["metadatas"])
        doc_counts: dict[str, int] = {}
        for m in all_meta["metadatas"]:
            sf = m.get("source_file", "unknown")
            doc_counts[sf] = doc_counts.get(sf, 0) + 1
        return [{"source_file": k, "chunk_count": v} for k, v in doc_counts.items()]

    async def delete_by_source(self, source_file: str) -> int:
        # Get IDs for this source
        all_data = self._collection.get(include=["metadatas"])
        ids_to_delete = [
            id_ for id_, m in zip(all_data["ids"], all_data["metadatas"])
            if m.get("source_file") == source_file
        ]
        if ids_to_delete:
            self._collection.delete(ids=ids_to_delete)
        return len(ids_to_delete)

    async def delete_collection(self, name: str) -> None:
        self._client.delete_collection(name or self.COLLECTION_NAME)
        self._collection = self._client.get_or_create_collection(
            name=self.COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

import json
import os
import numpy as np
import faiss
from app.providers.base import VectorStoreProvider


class FAISSStore(VectorStoreProvider):
    def __init__(self, settings):
        self.store_path = settings.VECTOR_STORE_PATH
        self._index: faiss.IndexFlatL2 | None = None
        self._metadata: list[dict] = []
        self._load()

    def _index_path(self) -> str:
        return os.path.join(self.store_path, "index.faiss")

    def _meta_path(self) -> str:
        return os.path.join(self.store_path, "metadata.json")

    def _load(self):
        idx_path = self._index_path()
        meta_path = self._meta_path()
        if os.path.exists(idx_path) and os.path.exists(meta_path):
            self._index = faiss.read_index(idx_path)
            with open(meta_path, "r") as f:
                self._metadata = json.load(f)

    def _save(self):
        os.makedirs(self.store_path, exist_ok=True)
        faiss.write_index(self._index, self._index_path())
        with open(self._meta_path(), "w") as f:
            json.dump(self._metadata, f)

    async def add(
        self, embeddings: list[list[float]], metadata: list[dict]
    ) -> None:
        vectors = np.array(embeddings, dtype=np.float32)
        if self._index is None:
            dim = vectors.shape[1]
            self._index = faiss.IndexFlatL2(dim)
        self._index.add(vectors)
        self._metadata.extend(metadata)
        self._save()

    async def search(
        self, query_embedding: list[float], top_k: int = 5,
        source_filter: str | None = None,
    ) -> list[dict]:
        if self._index is None or self._index.ntotal == 0:
            return []
        # Fetch more than top_k if filtering, to ensure enough results after filter
        fetch_k = min(top_k * 3, self._index.ntotal) if source_filter else min(top_k, self._index.ntotal)
        query = np.array([query_embedding], dtype=np.float32)
        distances, indices = self._index.search(query, fetch_k)
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0:
                continue
            entry = {**self._metadata[idx], "score": float(dist)}
            if source_filter and entry.get("source_file") != source_filter:
                continue
            results.append(entry)
            if len(results) >= top_k:
                break
        return results

    async def list_documents(self) -> list[dict]:
        doc_counts: dict[str, int] = {}
        for m in self._metadata:
            sf = m.get("source_file", "unknown")
            doc_counts[sf] = doc_counts.get(sf, 0) + 1
        return [{"source_file": k, "chunk_count": v} for k, v in doc_counts.items()]

    async def delete_by_source(self, source_file: str) -> int:
        if self._index is None:
            return 0
        keep_indices = [i for i, m in enumerate(self._metadata) if m.get("source_file") != source_file]
        deleted = len(self._metadata) - len(keep_indices)
        if deleted == 0:
            return 0
        if not keep_indices:
            # All chunks belong to this source — wipe everything
            self._index = None
            self._metadata = []
            self._save()
            return deleted
        # Rebuild index with remaining vectors
        all_vectors = faiss.rev_swig_ptr(self._index.get_xb(), self._index.ntotal * self._index.d)
        all_vectors = np.array(all_vectors).reshape(self._index.ntotal, self._index.d)
        keep_vectors = all_vectors[keep_indices]
        new_index = faiss.IndexFlatL2(self._index.d)
        new_index.add(np.array(keep_vectors, dtype=np.float32))
        self._index = new_index
        self._metadata = [self._metadata[i] for i in keep_indices]
        self._save()
        return deleted

    async def delete_collection(self, name: str) -> None:
        self._index = None
        self._metadata = []
        for path in [self._index_path(), self._meta_path()]:
            if os.path.exists(path):
                os.remove(path)

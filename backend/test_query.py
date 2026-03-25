"""Quick test: ingest check + RAG query."""
import asyncio
from app.generation import generate_answer
from app.providers.registry import get_vector_store


async def main():
    # Check documents
    store = get_vector_store()
    docs = await store.list_documents()
    print("=== Ingested Documents ===")
    for d in docs:
        print(f"  {d['source_file']}: {d['chunk_count']} chunks")

    # Test query
    print("\n=== Query: How do I set the white balance on the FX6? ===")
    answer, sources = await generate_answer("How do I set the white balance on the FX6?")
    print(f"\nAnswer:\n{answer[:800]}")
    print(f"\n--- Sources ({len(sources)} chunks) ---")
    for s in sources[:3]:
        print(f"  Page {s.get('page')}, Section: {s.get('section')}, Score: {s.get('score', '?')}")


if __name__ == "__main__":
    asyncio.run(main())

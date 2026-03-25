"""
PDF Ingestion Pipeline
- Parse PDF → extract text per page
- Chunk text with overlap
- Embed chunks
- Store in vector database
"""

import os
import re
import fitz  # PyMuPDF
from app.config import settings
from app.providers.registry import get_embedder, get_vector_store


def extract_text_from_pdf(pdf_path: str) -> list[dict]:
    """Extract text page-by-page, returning a list of {page, text} dicts."""
    doc = fitz.open(pdf_path)
    pages = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")
        if text.strip():
            pages.append({"page": page_num + 1, "text": text.strip()})
    doc.close()
    return pages


def detect_section(text: str) -> str | None:
    """Try to detect a section heading from the first line of a chunk."""
    first_line = text.split("\n")[0].strip()
    # Match patterns like "3.2 Installation" or "Chapter 4: Safety"
    if re.match(r"^(\d+\.?\d*\s+|Chapter\s+\d+)", first_line, re.IGNORECASE):
        return first_line[:100]
    return None


def chunk_pages(
    pages: list[dict],
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[dict]:
    """Split page text into overlapping chunks with metadata."""
    chunk_size = chunk_size or settings.CHUNK_SIZE
    chunk_overlap = chunk_overlap or settings.CHUNK_OVERLAP
    chunks = []
    chunk_index = 0

    for page_data in pages:
        text = page_data["text"]
        page_num = page_data["page"]
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk_text = text[start:end]
            section = detect_section(chunk_text)
            chunks.append(
                {
                    "text": chunk_text,
                    "metadata": {
                        "page": page_num,
                        "section": section,
                        "chunk_index": chunk_index,
                    },
                }
            )
            chunk_index += 1
            start += chunk_size - chunk_overlap

    return chunks


async def ingest_pdf(pdf_path: str, source_filename: str | None = None) -> dict:
    """Full pipeline: parse → chunk → embed → store. Returns stats."""
    source_filename = source_filename or os.path.basename(pdf_path)

    # 1. Extract
    pages = extract_text_from_pdf(pdf_path)
    if not pages:
        raise ValueError("No text content found in the PDF.")

    # 2. Chunk
    chunks = chunk_pages(pages)
    for c in chunks:
        c["metadata"]["source_file"] = source_filename

    # 3. Embed
    embedder = get_embedder()
    texts = [c["text"] for c in chunks]
    embeddings = await embedder.embed(texts)

    # 4. Store
    store = get_vector_store()
    metadata_with_text = [
        {**c["metadata"], "text": c["text"]} for c in chunks
    ]
    await store.add(embeddings, metadata_with_text)

    return {
        "pages_extracted": len(pages),
        "chunks_created": len(chunks),
        "source_file": source_filename,
    }

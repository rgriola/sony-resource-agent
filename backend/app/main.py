import asyncio
import json
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from app.config import settings
from app.models import QueryRequest, QueryResponse, IngestionResponse, ProviderConfig
from app.ingestion import ingest_pdf
from app.generation import generate_answer, generate_answer_stream
from app.scanner import check_folder, scan_and_ingest, get_scan_state, _poll_loop
from app.providers.registry import (
    list_providers,
    get_active_config,
    get_llm,
    get_embedder,
    get_vector_store,
)

logger = logging.getLogger("uvicorn.error")


# ────────────────────── Lifespan (startup / shutdown) ──────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: auto-scan source folder
    if settings.AUTO_SCAN_ON_STARTUP:
        logger.info("Auto-scanning PDF source folder on startup...")
        try:
            result = await scan_and_ingest()
            new_count = sum(1 for r in result.get("results", []) if r["status"] == "ingested")
            if new_count:
                logger.info(f"Startup scan: ingested {new_count} new PDF(s)")
            else:
                logger.info("Startup scan: no new PDFs to ingest")
        except Exception as e:
            logger.error(f"Startup scan failed: {e}")

    # Start background poll task
    poll_task = asyncio.create_task(_poll_loop())
    yield
    # Shutdown: cancel poll task
    poll_task.cancel()
    try:
        await poll_task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="PDF Manual Expert Agent", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ────────────────────── Health ──────────────────────


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ────────────────────── PDF Upload & Ingestion ──────────────────────


@app.post("/api/upload", response_model=IngestionResponse)
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Save to a temp file, ingest, then clean up
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = await ingest_pdf(tmp_path, source_filename=file.filename)
    finally:
        os.unlink(tmp_path)

    return IngestionResponse(**result)


# ────────────────────── Query (non-streaming) ──────────────────────


@app.post("/api/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    answer, sources = await generate_answer(
        req.question,
        system_prompt=req.system_prompt,
        top_k=req.top_k,
        source_filter=req.source_filter,
    )
    return QueryResponse(answer=answer, sources=sources)


# ────────────────────── Query (streaming via SSE) ──────────────────────


@app.post("/api/query/stream")
async def query_stream(req: QueryRequest):
    token_stream, sources = await generate_answer_stream(
        req.question,
        system_prompt=req.system_prompt,
        top_k=req.top_k,
        source_filter=req.source_filter,
    )

    async def event_generator():
        # Send sources first as a metadata event
        yield f"event: sources\ndata: {json.dumps(sources)}\n\n"
        # Then stream answer tokens
        async for token in token_stream:
            yield f"data: {json.dumps(token)}\n\n"
        yield "event: done\ndata: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ────────────────────── Document Management ──────────────────────


@app.get("/api/documents")
async def list_documents():
    """List all ingested PDFs with chunk counts."""
    store = get_vector_store()
    return await store.list_documents()


@app.delete("/api/documents/{filename:path}")
async def delete_document(filename: str):
    """Delete all chunks from a specific PDF."""
    store = get_vector_store()
    deleted = await store.delete_by_source(filename)
    if deleted == 0:
        raise HTTPException(status_code=404, detail=f"No chunks found for '{filename}'.")
    return {"deleted_chunks": deleted, "source_file": filename}


# ────────────────────── PDF File Serving (for viewer) ──────────────────────


@app.get("/api/pdfs/{filename:path}")
async def serve_pdf(filename: str):
    """Serve a PDF file from the source folder for the in-app viewer."""
    from app.scanner import _resolve_source_folder

    folder = _resolve_source_folder()
    file_path = (folder / filename).resolve()

    # Prevent path traversal
    if not str(file_path).startswith(str(folder)):
        raise HTTPException(status_code=403, detail="Access denied.")
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"PDF '{filename}' not found.")

    pdf_bytes = file_path.read_bytes()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "inline",
            "Cache-Control": "no-store",
        },
    )


# ────────────────────── Folder Scan (hybrid pipeline) ──────────────────────


@app.get("/api/scan/status")
async def scan_status():
    """Check what PDFs are on disk vs already ingested."""
    return await check_folder()


@app.post("/api/scan")
async def trigger_scan():
    """Scan the source folder and ingest any new PDFs."""
    result = await scan_and_ingest()
    return result


@app.get("/api/scan/state")
async def scan_state():
    """Get the current in-flight scan state (running, progress, etc.)."""
    return get_scan_state()


# ────────────────────── Provider Management (plug-and-play) ──────────────────────


@app.get("/api/providers")
async def providers():
    """List all available provider options."""
    return list_providers()


@app.get("/api/providers/active")
async def active_provider():
    """Get the currently active provider config (keys redacted)."""
    return get_active_config()


@app.put("/api/providers/active")
async def update_provider(config: ProviderConfig):
    """Switch provider and/or update credentials at runtime."""
    if config.llm_provider:
        settings.LLM_PROVIDER = config.llm_provider
    if config.llm_model:
        settings.LLM_MODEL = config.llm_model
    if config.embedding_provider:
        settings.EMBEDDING_PROVIDER = config.embedding_provider
    if config.embedding_model:
        settings.EMBEDDING_MODEL = config.embedding_model
    if config.vector_store_provider:
        settings.VECTOR_STORE_PROVIDER = config.vector_store_provider
    if config.api_key:
        # Route the key to the right provider
        provider = (config.llm_provider or settings.LLM_PROVIDER).lower()
        if provider == "openai":
            settings.OPENAI_API_KEY = config.api_key
        elif provider == "anthropic":
            settings.ANTHROPIC_API_KEY = config.api_key
        elif provider in ("custom", "ollama"):
            settings.CUSTOM_LLM_API_KEY = config.api_key

    # Re-initialize providers with new settings
    get_llm(refresh=True)
    get_embedder(refresh=True)
    get_vector_store(refresh=True)

    return get_active_config()

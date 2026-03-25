"""
PDF Source Folder Scanner
- Detects new/removed PDFs in the source folder
- Ingests un-indexed files automatically
- Provides status for the frontend
"""

import asyncio
import logging
import os
from pathlib import Path

from app.config import settings
from app.ingestion import ingest_pdf
from app.providers.registry import get_vector_store

logger = logging.getLogger("scanner")

# In-memory state for scan results
_scan_state: dict = {
    "running": False,
    "last_scan": None,
    "pending": [],       # filenames found on disk but not yet ingested
    "ingesting": None,   # filename currently being ingested
    "results": [],       # list of {filename, status, detail}
}


def _resolve_source_folder() -> Path:
    """Resolve PDF_SOURCE_FOLDER relative to the backend directory."""
    folder = Path(settings.PDF_SOURCE_FOLDER)
    if not folder.is_absolute():
        folder = Path(__file__).resolve().parent.parent / folder
    return folder.resolve()


def _list_pdfs_on_disk() -> list[str]:
    """Return sorted list of PDF filenames in the source folder."""
    folder = _resolve_source_folder()
    if not folder.is_dir():
        return []
    return sorted(
        f.name for f in folder.iterdir()
        if f.is_file() and f.suffix.lower() == ".pdf"
    )


async def _get_ingested_filenames() -> set[str]:
    """Return the set of filenames already in the vector store."""
    store = get_vector_store()
    docs = await store.list_documents()
    return {d["source_file"] for d in docs}


async def check_folder() -> dict:
    """Compare disk vs index and return status without ingesting."""
    on_disk = _list_pdfs_on_disk()
    ingested = await _get_ingested_filenames()
    pending = [f for f in on_disk if f not in ingested]
    ingested_list = [f for f in on_disk if f in ingested]
    removed = [f for f in ingested if f not in on_disk]
    return {
        "source_folder": str(_resolve_source_folder()),
        "on_disk": on_disk,
        "already_ingested": ingested_list,
        "pending_ingestion": pending,
        "removed_from_disk": removed,
    }


async def scan_and_ingest() -> dict:
    """Scan the source folder and ingest any new PDFs. Returns results."""
    global _scan_state

    if _scan_state["running"]:
        return {"status": "already_running", "results": _scan_state["results"]}

    _scan_state["running"] = True
    _scan_state["results"] = []

    try:
        status = await check_folder()
        pending = status["pending_ingestion"]
        _scan_state["pending"] = list(pending)
        folder = _resolve_source_folder()

        for filename in pending:
            _scan_state["ingesting"] = filename
            pdf_path = str(folder / filename)
            try:
                result = await ingest_pdf(pdf_path, source_filename=filename)
                _scan_state["results"].append({
                    "filename": filename,
                    "status": "ingested",
                    "pages": result["pages_extracted"],
                    "chunks": result["chunks_created"],
                })
                logger.info(f"Ingested {filename}: {result['chunks_created']} chunks")
            except Exception as e:
                _scan_state["results"].append({
                    "filename": filename,
                    "status": "error",
                    "detail": str(e),
                })
                logger.error(f"Failed to ingest {filename}: {e}")

        _scan_state["ingesting"] = None
        _scan_state["pending"] = []
        import datetime
        _scan_state["last_scan"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

        return {
            "status": "completed",
            "results": _scan_state["results"],
            "source_folder": str(folder),
        }
    finally:
        _scan_state["running"] = False


def get_scan_state() -> dict:
    return dict(_scan_state)


async def _poll_loop():
    """Background loop that periodically scans for new PDFs."""
    interval = settings.SCAN_POLL_INTERVAL_SECONDS
    if interval <= 0:
        logger.info("Folder polling disabled (SCAN_POLL_INTERVAL_SECONDS=0)")
        return

    logger.info(f"Starting folder poll loop every {interval}s")
    while True:
        await asyncio.sleep(interval)
        try:
            status = await check_folder()
            if status["pending_ingestion"]:
                logger.info(
                    f"Poll detected {len(status['pending_ingestion'])} new PDF(s), ingesting..."
                )
                await scan_and_ingest()
        except Exception as e:
            logger.error(f"Poll error: {e}")

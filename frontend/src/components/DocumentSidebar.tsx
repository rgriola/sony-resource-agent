"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Upload,
  ExternalLink,
  FolderSync,
  Loader2,
  CircleDot,
} from "lucide-react";
import {
  listDocuments,
  getScanStatus,
  triggerScan,
  DocumentInfo,
  ScanStatus,
} from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface DocumentSidebarProps {
  selectedDocument: string | undefined;
  onSelectDocument: (filename: string | undefined) => void;
  onUploadClick: () => void;
  refreshKey: number;
  onRefresh: () => void;
}

export default function DocumentSidebar({
  selectedDocument,
  onSelectDocument,
  onUploadClick,
  refreshKey,
  onRefresh,
}: DocumentSidebarProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch {
      // backend may not be ready yet
    } finally {
      setLoading(false);
    }
  };

  const fetchScanStatus = async () => {
    try {
      const status = await getScanStatus();
      setScanStatus(status);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchDocs();
    fetchScanStatus();
  }, [refreshKey]);

  const handleScan = async () => {
    setScanning(true);
    setScanMessage(null);
    try {
      const result = await triggerScan();
      const ingested = result.results.filter((r) => r.status === "ingested");
      if (ingested.length > 0) {
        setScanMessage(`Ingested ${ingested.length} new PDF(s)`);
        onRefresh();
      } else {
        setScanMessage("No new PDFs found");
      }
      fetchDocs();
      fetchScanStatus();
    } catch {
      setScanMessage("Scan failed");
    } finally {
      setScanning(false);
      setTimeout(() => setScanMessage(null), 4000);
    }
  };

  const handleOpenInBrowser = (filename: string) => {
    window.open(`${API_URL}/api/pdfs/${encodeURIComponent(filename)}`, "_blank");
  };

  const pendingCount = scanStatus?.pending_ingestion?.length ?? 0;

  return (
    <div className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Documents
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="relative rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title={pendingCount > 0 ? `Scan folder (${pendingCount} new)` : "Scan folder for new PDFs"}
          >
            {scanning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderSync className="h-4 w-4" />
            )}
            {pendingCount > 0 && !scanning && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={onUploadClick}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Upload PDF"
          >
            <Upload className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scan feedback banner */}
      {scanMessage && (
        <div className="border-b border-zinc-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 dark:border-zinc-800 dark:bg-blue-950 dark:text-blue-300">
          {scanMessage}
        </div>
      )}

      {/* Pending files banner */}
      {pendingCount > 0 && !scanning && !scanMessage && (
        <button
          onClick={handleScan}
          className="flex items-center gap-1.5 border-b border-zinc-200 bg-amber-50 px-3 py-1.5 text-left text-xs text-amber-700 transition-colors hover:bg-amber-100 dark:border-zinc-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          <CircleDot className="h-3 w-3 shrink-0" />
          {pendingCount} new PDF{pendingCount > 1 ? "s" : ""} detected — click to ingest
        </button>
      )}

      {/* "All documents" option */}
      <button
        onClick={() => onSelectDocument(undefined)}
        className={`flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
          !selectedDocument
            ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
        }`}
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="truncate">All Documents</span>
      </button>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-3 py-4 text-xs text-zinc-400">Loading...</p>
        ) : documents.length === 0 ? (
          <p className="px-3 py-4 text-xs text-zinc-400">
            No documents yet. Upload a PDF or scan the source folder.
          </p>
        ) : (
          documents.map((doc) => (
            <div
              key={doc.source_file}
              className={`group flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                selectedDocument === doc.source_file
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              <button
                onClick={() => onSelectDocument(doc.source_file)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate">{doc.source_file}</p>
                  <p className="text-xs text-zinc-400">
                    {doc.chunk_count} chunks
                  </p>
                </div>
              </button>
              <button
                onClick={() => handleOpenInBrowser(doc.source_file)}
                className="ml-1 rounded p-1 text-zinc-400 opacity-0 transition-all hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100 dark:hover:bg-blue-950"
                title="Open in browser"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

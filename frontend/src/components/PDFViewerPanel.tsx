"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
} from "lucide-react";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PDFViewerPanelProps {
  filename: string;
  page: number;
  onClose: () => void;
  onPageChange: (page: number) => void;
}

export default function PDFViewerPanel({
  filename,
  page,
  onClose,
  onPageChange,
}: PDFViewerPanelProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [userScale, setUserScale] = useState(1.0);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const dragStart = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
  const lastPinchDist = useRef(0);

  const pdfUrl = `${API_URL}/api/pdfs/${encodeURIComponent(filename)}`;

  // Track container width for fit-to-width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Subtract padding (2 * 16px) from available width
  const fitWidth = useMemo(() => Math.max(containerWidth - 32, 200), [containerWidth]);

  const isZoomed = userScale !== 1.0;

  // ── Mouse drag-to-pan ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isZoomed) return;
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      setIsDragging(true);
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        scrollX: el.scrollLeft,
        scrollY: el.scrollTop,
      };
    },
    [isZoomed],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const el = containerRef.current;
      if (!el) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      el.scrollLeft = dragStart.current.scrollX - dx;
      el.scrollTop = dragStart.current.scrollY - dy;
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ── Touch: drag-to-pan + pinch-to-zoom ──
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch start
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist.current = Math.hypot(dx, dy);
      } else if (e.touches.length === 1 && isZoomed) {
        // Single-finger drag when zoomed
        const el = containerRef.current;
        if (!el) return;
        setIsDragging(true);
        dragStart.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          scrollX: el.scrollLeft,
          scrollY: el.scrollTop,
        };
      }
    },
    [isZoomed],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch zoom
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (lastPinchDist.current > 0) {
          const delta = dist / lastPinchDist.current;
          setUserScale((s) => Math.min(3, Math.max(0.5, s * delta)));
        }
        lastPinchDist.current = dist;
      } else if (e.touches.length === 1 && isDragging) {
        // Single-finger pan
        const el = containerRef.current;
        if (!el) return;
        const dx = e.touches[0].clientX - dragStart.current.x;
        const dy = e.touches[0].clientY - dragStart.current.y;
        el.scrollLeft = dragStart.current.scrollX - dx;
        el.scrollTop = dragStart.current.scrollY - dy;
      }
    },
    [isDragging],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    lastPinchDist.current = 0;
  }, []);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setLoading(false);
      setError(null);
    },
    [],
  );

  const onDocumentLoadError = useCallback((err: Error) => {
    setError("Failed to load PDF");
    setLoading(false);
    console.error("PDF load error:", err);
  }, []);

  const goToPage = useCallback(
    (p: number) => {
      if (numPages && p >= 1 && p <= numPages) {
        onPageChange(p);
      }
    },
    [numPages, onPageChange],
  );

  const handlePageInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val)) goToPage(val);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") goToPage(page - 1);
      if (e.key === "ArrowRight") goToPage(page + 1);
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [page, goToPage, onClose]);

  // Scroll to top when page changes
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  return (
    <div
      className={`flex shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 ${
        expanded ? "w-[60%]" : "w-[520px]"
      } transition-all duration-200`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {filename}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Close viewer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              ref={pageInputRef}
              type="text"
              defaultValue={page}
              key={page}
              onKeyDown={handlePageInput}
              className="w-10 rounded border border-zinc-200 bg-transparent px-1.5 py-0.5 text-center text-xs dark:border-zinc-700"
            />
            <span>/ {numPages ?? "..."}</span>
          </div>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={!numPages || page >= numPages}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setUserScale((s) => Math.max(0.5, s - 0.15))}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[3rem] text-center text-xs text-zinc-500">
            {Math.round(userScale * 100)}%
          </span>
          <button
            onClick={() => setUserScale((s) => Math.min(3, s + 0.15))}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          {isZoomed && (
            <button
              onClick={() => setUserScale(1.0)}
              className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
            >
              Fit
            </button>
          )}
        </div>
      </div>

      {/* PDF Content */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-900 ${
          isZoomed
            ? isDragging
              ? "cursor-grabbing"
              : "cursor-grab"
            : ""
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {error ? (
          <div className="flex h-full items-center justify-center p-4 text-sm text-red-500">
            {error}
          </div>
        ) : (
          <div className="inline-block min-w-full p-4" style={{ textAlign: "center" }}>
            <div className="inline-block" style={{ textAlign: "left" }}>
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex h-64 items-center justify-center text-xs text-zinc-400">
                    Loading PDF...
                  </div>
                }
              >
                <Page
                  pageNumber={page}
                  width={userScale === 1.0 ? fitWidth : undefined}
                  scale={userScale !== 1.0 ? userScale : undefined}
                  className="shadow-lg"
                  loading={
                    <div className="flex h-64 items-center justify-center text-xs text-zinc-400">
                      Loading page {page}...
                  </div>
                }
              />
            </Document>
            </div>
          </div>
        )}
      </div>

      {/* Footer with cited page indicator */}
      <div className="border-t border-zinc-200 px-3 py-1.5 text-center text-xs text-zinc-400 dark:border-zinc-800">
        Viewing page {page} {numPages ? `of ${numPages}` : ""}
      </div>
    </div>
  );
}

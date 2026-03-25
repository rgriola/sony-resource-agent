"use client";

import { useState, useCallback } from "react";
import { Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { uploadPDF, IngestionResponse } from "@/lib/api";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

export default function UploadModal({ isOpen, onClose, onUploaded }: UploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<IngestionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Only PDF files are accepted.");
        return;
      }
      setIsUploading(true);
      setError(null);
      setResult(null);
      try {
        const res = await uploadPDF(file);
        setResult(res);
        onUploaded();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [onUploaded],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Upload PDF Manual
        </h2>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            isDragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          {isUploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          ) : (
            <Upload className="h-8 w-8 text-zinc-400" />
          )}
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {isUploading ? "Processing PDF..." : "Drag & drop a PDF here, or"}
          </p>
          {!isUploading && (
            <label className="mt-2 cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
              Browse Files
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>
          )}
        </div>

        {result && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 p-3 dark:bg-green-950">
            <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
            <div className="text-sm text-green-800 dark:text-green-200">
              <p className="font-medium">{result.source_file}</p>
              <p>
                {result.pages_extracted} pages → {result.chunks_created} chunks
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 dark:bg-red-950">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Source {
  page: number;
  section: string | null;
  chunk_index: number;
  source_file: string;
  text: string;
  score: number;
}

export interface QueryResponse {
  answer: string;
  sources: Source[];
}

export interface IngestionResponse {
  pages_extracted: number;
  chunks_created: number;
  source_file: string;
}

export interface DocumentInfo {
  source_file: string;
  chunk_count: number;
}

export interface ProviderList {
  llm: string[];
  embedding: string[];
  vector_store: string[];
}

export interface ActiveConfig {
  llm_provider: string;
  llm_model: string;
  embedding_provider: string;
  embedding_model: string;
  vector_store_provider: string;
}

export async function healthCheck(): Promise<{ status: string }> {
  const res = await fetch(`${API_URL}/api/health`);
  return res.json();
}

export async function uploadPDF(file: File): Promise<IngestionResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function queryNonStreaming(
  question: string,
  sourceFilter?: string,
  systemPrompt?: string,
): Promise<QueryResponse> {
  const res = await fetch(`${API_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      source_filter: sourceFilter || null,
      system_prompt: systemPrompt || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Query failed" }));
    throw new Error(err.detail || "Query failed");
  }
  return res.json();
}

export async function queryStream(
  question: string,
  sourceFilter?: string,
  systemPrompt?: string,
  onToken?: (token: string) => void,
  onSources?: (sources: Source[]) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      source_filter: sourceFilter || null,
      system_prompt: systemPrompt || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Query failed" }));
    throw new Error(err.detail || "Query failed");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event: sources")) {
        // Next data line contains sources
        continue;
      }
      if (line.startsWith("event: done")) {
        return;
      }
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          // If it's an array, it's sources; if string, it's a token
          if (Array.isArray(parsed)) {
            onSources?.(parsed);
          } else {
            onToken?.(parsed);
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  }
}

export async function listDocuments(): Promise<DocumentInfo[]> {
  const res = await fetch(`${API_URL}/api/documents`);
  return res.json();
}

export async function deleteDocument(filename: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/documents/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Delete failed" }));
    throw new Error(err.detail || "Delete failed");
  }
}

export async function getProviders(): Promise<ProviderList> {
  const res = await fetch(`${API_URL}/api/providers`);
  return res.json();
}

export async function getActiveConfig(): Promise<ActiveConfig> {
  const res = await fetch(`${API_URL}/api/providers/active`);
  return res.json();
}

export async function updateProvider(config: Partial<{
  llm_provider: string;
  llm_model: string;
  embedding_provider: string;
  embedding_model: string;
  vector_store_provider: string;
  api_key: string;
}>): Promise<ActiveConfig> {
  const res = await fetch(`${API_URL}/api/providers/active`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}

// ────────────────────── Folder Scan ──────────────────────

export interface ScanStatus {
  source_folder: string;
  on_disk: string[];
  already_ingested: string[];
  pending_ingestion: string[];
  removed_from_disk: string[];
}

export interface ScanResult {
  status: string;
  results: Array<{
    filename: string;
    status: string;
    pages?: number;
    chunks?: number;
    detail?: string;
  }>;
  source_folder?: string;
}

export async function getScanStatus(): Promise<ScanStatus> {
  const res = await fetch(`${API_URL}/api/scan/status`);
  return res.json();
}

export async function triggerScan(): Promise<ScanResult> {
  const res = await fetch(`${API_URL}/api/scan`, { method: "POST" });
  return res.json();
}

# PDF Instruction Manual Expert Agent — Implementation Plan

## Overview

Build a **plug-and-play** conversational AI agent that ingests a PDF instruction manual, indexes its content, and answers user questions with cited, grounded responses. Users can swap in their own LLM provider, embedding model, or custom agent without changing application code — just configure via the Settings panel or environment variables. The UI is a chat interface with an integrated PDF viewer.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  PDF Upload  │────▶│  Ingestion   │────▶│  Vector DB │
│              │     │  Pipeline    │     │  (pluggable)│
└─────────────┘     └──────────────┘     └─────┬──────┘
                                               │
┌─────────────┐     ┌──────────────┐     ┌─────┴──────┐
│  User Chat  │────▶│  RAG Engine  │◀────│  Provider  │
│  (React UI) │◀────│  (FastAPI)   │────▶│  Registry  │
└─────────────┘     └──────────────┘     └────────────┘
                                               │
                                    ┌──────────┼──────────┐
                                    ▼          ▼          ▼
                               ┌────────┐ ┌────────┐ ┌────────┐
                               │ OpenAI │ │ Claude │ │ Custom │
                               │Adapter │ │Adapter │ │Adapter │
                               └────────┘ └────────┘ └────────┘
```

---

## Phase 1: PDF Ingestion Pipeline

### Goal
Extract, chunk, embed, and store the manual content so it can be retrieved at query time.

### Steps

1. **Parse the PDF**
   - Library: `PyMuPDF` (fitz) for text extraction, `pdfplumber` for tables
   - Extract text page-by-page, preserving page numbers
   - Extract images and diagrams; describe them with a vision model (GPT-4o or Claude) during ingestion so they become searchable text

2. **Chunk the content**
   - Use a recursive character text splitter (LangChain or custom)
   - Target chunk size: **400 tokens**, overlap: **50 tokens**
   - Attach metadata to every chunk:
     ```json
     {
       "page": 12,
       "section": "3.2 Installation",
       "chunk_index": 0,
       "source_file": "manual_v2.pdf"
     }
     ```

3. **Generate embeddings**
   - Model: `text-embedding-3-small` (OpenAI) or `bge-small-en-v1.5` (open-source)
   - Batch embed all chunks

4. **Store in vector database**
   - Use **FAISS** for a local prototype or **Chroma** for persistence
   - Save the index to disk so it survives restarts 

### Agent Prompt — Ingestion Validation

After ingestion, use this prompt to verify quality:

```
You are a QA auditor for a document ingestion pipeline.

Given the following chunk of text extracted from a PDF manual, evaluate:
1. Is the text coherent and readable (not garbled OCR artifacts)?
2. Does the metadata (page number, section title) appear accurate?
3. Are there obvious missing sections or formatting issues?

Chunk:
"""
{chunk_text}
"""

Metadata:
{chunk_metadata}

Respond with a JSON object:
{
  "readable": true/false,
  "metadata_accurate": true/false,
  "issues": ["list of any problems found"]
}
```

---

## Phase 1.5: Plug-and-Play Agent Core

### Goal
Allow users to plug in their own LLM provider, embedding model, vector store, or fully custom agent — without modifying application code.

### Design: Provider Registry + Adapter Pattern

Every swappable component (LLM, embedder, vector store) implements a common interface. A **Provider Registry** discovers and loads the active provider at startup based on config.

#### Abstract Interfaces (Python ABCs)

```python
# backend/app/providers/base.py

from abc import ABC, abstractmethod
from typing import AsyncIterator

class LLMProvider(ABC):
    """Interface every LLM adapter must implement."""

    @abstractmethod
    async def generate(self, system_prompt: str, user_message: str,
                       context_chunks: list[dict]) -> str: ...

    @abstractmethod
    async def generate_stream(self, system_prompt: str, user_message: str,
                              context_chunks: list[dict]) -> AsyncIterator[str]: ...


class EmbeddingProvider(ABC):
    """Interface every embedding adapter must implement."""

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...

    @property
    @abstractmethod
    def dimension(self) -> int: ...


class VectorStoreProvider(ABC):
    """Interface every vector store adapter must implement."""

    @abstractmethod
    async def add(self, embeddings: list[list[float]], metadata: list[dict]) -> None: ...

    @abstractmethod
    async def search(self, query_embedding: list[float], top_k: int) -> list[dict]: ...

    @abstractmethod
    async def delete_collection(self, name: str) -> None: ...
```

#### Built-in Adapters

| Adapter | Implements | Notes |
|---------|-----------|-------|
| `OpenAILLM` | `LLMProvider` | GPT-4o, GPT-4o-mini, o1, etc. |
| `AnthropicLLM` | `LLMProvider` | Claude 3.5 Sonnet, Claude 4, etc. |
| `OllamaLLM` | `LLMProvider` | Any local model via Ollama API |
| `CustomLLM` | `LLMProvider` | User supplies an OpenAI-compatible endpoint URL |
| `OpenAIEmbedding` | `EmbeddingProvider` | text-embedding-3-small / large |
| `HuggingFaceEmbedding` | `EmbeddingProvider` | bge, e5, or any sentence-transformers model |
| `FAISSStore` | `VectorStoreProvider` | Local, fast, file-persisted |
| `ChromaStore` | `VectorStoreProvider` | Persistent, supports metadata filtering |

#### Provider Registry

```python
# backend/app/providers/registry.py

from app.providers.base import LLMProvider, EmbeddingProvider, VectorStoreProvider
from app.config import settings

_PROVIDERS = {
    "llm": {
        "openai":    "app.providers.openai_llm.OpenAILLM",
        "anthropic": "app.providers.anthropic_llm.AnthropicLLM",
        "ollama":    "app.providers.ollama_llm.OllamaLLM",
        "custom":    "app.providers.custom_llm.CustomLLM",
    },
    "embedding": {
        "openai":       "app.providers.openai_embedding.OpenAIEmbedding",
        "huggingface":  "app.providers.hf_embedding.HuggingFaceEmbedding",
    },
    "vector_store": {
        "faiss":  "app.providers.faiss_store.FAISSStore",
        "chroma": "app.providers.chroma_store.ChromaStore",
    },
}

def _import_class(dotted_path: str):
    module_path, class_name = dotted_path.rsplit(".", 1)
    import importlib
    module = importlib.import_module(module_path)
    return getattr(module, class_name)

def get_llm() -> LLMProvider:
    cls = _import_class(_PROVIDERS["llm"][settings.LLM_PROVIDER])
    return cls(settings)

def get_embedder() -> EmbeddingProvider:
    cls = _import_class(_PROVIDERS["embedding"][settings.EMBEDDING_PROVIDER])
    return cls(settings)

def get_vector_store() -> VectorStoreProvider:
    cls = _import_class(_PROVIDERS["vector_store"][settings.VECTOR_STORE_PROVIDER])
    return cls(settings)
```

#### Adding a Custom Provider (User Guide)

Users add their own agent in 3 steps:

1. **Create a new file** in `backend/app/providers/`, e.g. `my_agent.py`
2. **Implement the interface**:
   ```python
   from app.providers.base import LLMProvider

   class MyCustomAgent(LLMProvider):
       def __init__(self, settings):
           self.api_url = settings.CUSTOM_LLM_ENDPOINT
           self.api_key = settings.CUSTOM_LLM_API_KEY

       async def generate(self, system_prompt, user_message, context_chunks):
           # Call your own API / local model / agent framework
           ...

       async def generate_stream(self, system_prompt, user_message, context_chunks):
           # Yield tokens one at a time
           ...
   ```
3. **Register it** — add one line to the registry or set env vars:
   ```env
   LLM_PROVIDER=custom
   CUSTOM_LLM_ENDPOINT=http://localhost:11434/v1/chat/completions
   CUSTOM_LLM_API_KEY=optional-key
   ```

No other code changes needed. The app discovers and loads the provider at startup.

### UI: Settings Panel for Provider Configuration

The Settings drawer exposes provider selection and credentials so non-technical users can switch providers without touching env vars:

```
┌─────────────────────────────────────────┐
│  ⚙ Settings                             │
├─────────────────────────────────────────┤
│                                         │
│  LLM Provider     [▾ OpenAI          ]  │
│  Model            [▾ gpt-4o          ]  │
│  API Key          [••••••••••••••••••]  │
│  Custom Endpoint  [                   ] │
│                                         │
│  Embedding Model  [▾ OpenAI small    ]  │
│  Embedding Key    [••••••••••••••••••]  │
│                                         │
│  Vector Store     [▾ FAISS (local)   ]  │
│                                         │
│  System Prompt    [Edit ✏]              │
│  ┌─────────────────────────────────┐    │
│  │ You are an expert technical...  │    │
│  │ (editable text area)            │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [ Save & Reconnect ]  [ Reset ]        │
└─────────────────────────────────────────┘
```

**Key features:**
- Dropdown to pick LLM provider (OpenAI, Anthropic, Ollama, Custom endpoint)
- Model selector dynamically populated per provider
- API key fields (stored in backend memory only, never persisted to disk unencrypted)
- Editable system prompt — users can customize the agent's personality and rules
- "Save & Reconnect" re-initializes the provider without restarting the server

### API Endpoints for Provider Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/providers` | List available LLM/embedding/vector store providers |
| GET | `/api/providers/active` | Get current active provider config (keys redacted) |
| PUT | `/api/providers/active` | Switch provider and/or update credentials at runtime |
| GET | `/api/providers/{type}/{name}/models` | List available models for a provider (e.g., OpenAI model list) |

---

## Phase 2: RAG Query Engine (Backend)

### Goal
Accept user questions, retrieve relevant chunks, and generate grounded answers with citations.

### Stack
- **Framework**: FastAPI (Python)
- **Retrieval**: FAISS similarity search → optional Cohere/BGE reranker
- **Generation**: OpenAI GPT-4o or Anthropic Claude via API
- **Streaming**: Server-Sent Events (SSE) for token-by-token streaming to the UI

### Query Flow

```
User question
    │
    ▼
Embed query (same model as ingestion)
    │
    ▼
Vector search → top 8 chunks
    │
    ▼
(Optional) Rerank → top 4 chunks
    │
    ▼
Build prompt with system message + retrieved context
    │
    ▼
Stream LLM response back to UI
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload and ingest a PDF |
| POST | `/api/query` | Send a question, receive streamed answer |
| GET  | `/api/sources/{query_id}` | Get source chunks for a past answer |
| GET  | `/api/health` | Health check |

### Agent Prompt — Answer Generation (System Message)

```
You are an expert technical assistant for the product described in the provided instruction manual.

RULES:
- Answer questions using ONLY the manual excerpts provided below as context.
- Always cite your sources using the format [Page X, Section Y].
- If multiple sections are relevant, reference all of them.
- If the manual does not contain enough information to answer the question, say:
  "I couldn't find this information in the manual. The closest related topic is [topic] on page [X]."
- Never fabricate information that isn't in the provided context.
- Use clear, concise language appropriate for someone following an instruction manual.
- When describing procedures, use numbered steps.
- If the question is ambiguous, ask a clarifying question before answering.

CONTEXT FROM MANUAL:
---
{retrieved_chunks}
---

USER QUESTION: {user_question}
```

### Agent Prompt — Follow-Up Handling

```
You are continuing a conversation about a product instruction manual.

Previous conversation:
{conversation_history}

New context retrieved for the follow-up question:
---
{retrieved_chunks}
---

The user's follow-up question: {user_question}

Maintain continuity with the previous answers. If the follow-up references
something discussed earlier, connect it. Always cite [Page X, Section Y].
```

### Agent Prompt — Safety & Out-of-Scope

```
You are a manual-expert assistant. The user has asked a question that appears
to be outside the scope of the instruction manual.

User question: {user_question}

If the question is:
- About a different product → Say so and suggest they check the correct manual.
- A general knowledge question unrelated to the product → Politely redirect:
  "I'm specialized in this product's manual. For general questions, a search
  engine would be more helpful."
- A safety concern → Always err on the side of caution and recommend
  contacting the manufacturer or a professional.
```

---

## Phase 3: UI (Frontend)

### Goal
A clean, responsive chat interface with integrated PDF viewing and source citations.

### Stack
- **Framework**: Next.js 14+ (App Router) with React
- **Chat UI**: Vercel `ai` SDK for streaming + custom chat components
- **PDF Viewer**: `react-pdf` or `@react-pdf-viewer/core`
- **Styling**: Tailwind CSS
- **State**: React context or Zustand for conversation state

### Layout

```
┌────────────────────────────────────────────────────┐
│  Header: Product Name / Manual Title               │
├────────────────────────┬───────────────────────────┤
│                        │                           │
│   Chat Panel           │   PDF Viewer Panel        │
│                        │                           │
│  ┌──────────────────┐  │  ┌─────────────────────┐  │
│  │ Agent: Welcome!  │  │  │                     │  │
│  │ Ask me anything  │  │  │   [PDF rendered      │  │
│  │ about the manual │  │  │    with highlights]  │  │
│  └──────────────────┘  │  │                     │  │
│                        │  │                     │  │
│  ┌──────────────────┐  │  └─────────────────────┘  │
│  │ User: How do I   │  │                           │
│  │ reset the device?│  │  Page: 12 of 45           │
│  └──────────────────┘  │  ◀ ▶  Zoom: 100%          │
│                        │                           │
│  ┌──────────────────┐  │                           │
│  │ Agent: To reset, │  │                           │
│  │ follow these...  │  │                           │
│  │ [Page 12, §3.2]  │  │                           │
│  └──────────────────┘  │                           │
│                        │                           │
│  ┌──────────────────┐  │                           │
│  │ 💬 Type a question│  │                           │
│  └──────────────────┘  │                           │
├────────────────────────┴───────────────────────────┤
│  Suggested: "How to install?" | "Safety warnings"  │
└────────────────────────────────────────────────────┘
```

### UI Features

| Feature | Description |
|---------|-------------|
| **Streaming responses** | Tokens appear as they're generated, giving fast perceived latency |
| **Clickable citations** | `[Page 12, §3.2]` links scroll the PDF viewer to that page and highlight the relevant passage |
| **Suggested questions** | Auto-generated from the table of contents on first load |
| **PDF upload** | Drag-and-drop zone for uploading new manuals; shows ingestion progress |
| **Conversation history** | Scrollable chat with user/agent message bubbles |
| **Mobile responsive** | Chat-only on mobile; PDF viewer available via a toggle |
| **Dark/light mode** | Respects system preference via Tailwind |

### Component Tree

```
App
├── Header
├── MainLayout (split pane, resizable)
│   ├── ChatPanel
│   │   ├── MessageList
│   │   │   ├── UserMessage
│   │   │   └── AgentMessage
│   │   │       └── CitationLink (clickable → scrolls PDF)
│   │   ├── SuggestedQuestions
│   │   └── ChatInput
│   └── PDFViewerPanel
│       ├── PDFDocument
│       ├── PageNavigation
│       └── HighlightOverlay
├── UploadModal
└── SettingsDrawer
    ├── ProviderSelector (LLM / Embedding / Vector Store dropdowns)
    ├── ModelSelector (dynamic per provider)
    ├── APIKeyInput (masked, stored in backend session only)
    ├── CustomEndpointInput
    └── SystemPromptEditor (textarea for overriding default prompt)
```

---

## Phase 4: Suggested Questions Generation

### Agent Prompt — Generate Starter Questions

Run this once after ingestion to populate the UI with suggested questions:

```
You are analyzing the table of contents and key sections of a product
instruction manual.

Table of contents:
{toc_text}

First 3 pages of content:
{intro_text}

Generate exactly 6 suggested questions that a user of this product would
most likely ask. The questions should:
1. Cover different sections of the manual (setup, usage, troubleshooting, safety)
2. Be written in natural, conversational language
3. Be specific enough to get useful answers

Return as a JSON array of strings:
["question 1", "question 2", ...]
```

---

## Phase 5: Evaluation & Quality

### Agent Prompt — Answer Evaluation (Automated QA)

Use this to test answer quality during development:

```
You are evaluating the quality of an AI assistant's answer about a product
instruction manual.

Question: {question}
Ground truth (from manual): {ground_truth_passage}
Agent's answer: {agent_answer}

Score each dimension 1-5:
- **Accuracy**: Does the answer match the manual's content?
- **Completeness**: Does it cover all relevant information?
- **Citation quality**: Are page/section references correct and present?
- **Clarity**: Is the answer easy to understand?
- **Hallucination**: Does it include anything NOT in the manual? (5 = no hallucination)

Return JSON:
{
  "accuracy": X,
  "completeness": X,
  "citation_quality": X,
  "clarity": X,
  "hallucination": X,
  "overall": X,
  "notes": "..."
}
```

---

## File Structure

```
pdf-reader/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, routes
│   │   ├── ingestion.py         # PDF parsing, chunking, embedding
│   │   ├── retrieval.py         # Vector search, reranking
│   │   ├── generation.py        # LLM prompt building, streaming
│   │   ├── models.py            # Pydantic request/response models
│   │   ├── config.py            # Env vars, model settings
│   │   └── providers/           # ★ Plug-and-play provider system
│   │       ├── __init__.py
│   │       ├── base.py          # Abstract interfaces (LLMProvider, EmbeddingProvider, VectorStoreProvider)
│   │       ├── registry.py      # Provider discovery & factory
│   │       ├── openai_llm.py    # OpenAI GPT adapter
│   │       ├── anthropic_llm.py # Anthropic Claude adapter
│   │       ├── ollama_llm.py    # Ollama (local models) adapter
│   │       ├── custom_llm.py    # Generic OpenAI-compatible endpoint adapter
│   │       ├── openai_embedding.py
│   │       ├── hf_embedding.py  # HuggingFace / sentence-transformers
│   │       ├── faiss_store.py
│   │       └── chroma_store.py
│   ├── data/
│   │   └── faiss_index/         # Persisted vector index
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Main layout
│   │   │   └── api/             # Next.js API routes (proxy to backend)
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── AgentMessage.tsx
│   │   │   ├── CitationLink.tsx
│   │   │   ├── PDFViewer.tsx
│   │   │   ├── SuggestedQuestions.tsx
│   │   │   └── UploadModal.tsx
│   │   ├── hooks/
│   │   │   ├── useChat.ts
│   │   │   ├── usePDFNavigation.ts
│   │   │   └── useProviders.ts  # ★ Hook: fetch/switch providers
│   │   └── lib/
│   │       └── api.ts           # Backend API client
│   ├── package.json
│   └── tailwind.config.ts
├── docker-compose.yml
└── PDF_AGENT_PLAN.md            # This file
```

---

## Environment Variables

```env
# Backend — Core
CHUNK_SIZE=400
CHUNK_OVERLAP=50
TOP_K_RETRIEVAL=8
TOP_K_AFTER_RERANK=4
VECTOR_STORE_PATH=./data/faiss_index

# Backend — Provider Selection (plug-and-play)
LLM_PROVIDER=openai              # openai | anthropic | ollama | custom
LLM_MODEL=gpt-4o                 # model name within the chosen provider
EMBEDDING_PROVIDER=openai        # openai | huggingface
EMBEDDING_MODEL=text-embedding-3-small
VECTOR_STORE_PROVIDER=faiss      # faiss | chroma

# Backend — Provider API Keys (set only the ones you use)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Backend — Custom / Self-Hosted Provider
CUSTOM_LLM_ENDPOINT=             # e.g. http://localhost:11434/v1/chat/completions
CUSTOM_LLM_API_KEY=              # optional
CUSTOM_EMBEDDING_ENDPOINT=       # optional

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Implementation Order

| Step | Task | Estimated Complexity |
|------|------|---------------------|
| 1 | Set up Python backend with FastAPI | Low |
| 2 | **Build provider interfaces & registry (plug-and-play core)** | **Medium** |
| 3 | Implement OpenAI + Ollama LLM adapters | Medium |
| 4 | Implement embedding & vector store adapters | Medium |
| 5 | Build PDF ingestion pipeline (parse → chunk → embed → store) | Medium |
| 6 | Build RAG query endpoint with streaming | Medium |
| 7 | Scaffold Next.js frontend with Tailwind | Low |
| 8 | Build ChatPanel with streaming via Vercel AI SDK | Medium |
| 9 | **Build Settings panel for provider switching** | **Medium** |
| 10 | Integrate `react-pdf` viewer with citation-based navigation | Medium |
| 11 | Add PDF upload with progress indicator | Low |
| 12 | Generate and display suggested questions | Low |
| 13 | Add reranking for improved retrieval precision | Low |
| 14 | Evaluation suite with automated QA prompts | Low |

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| RAG vs fine-tuning | **RAG** | Updatable, traceable citations, no training cost |
| Vector DB | **FAISS** (prototype) → **Chroma** (production) | FAISS is fast and local; Chroma adds persistence and filtering |
| LLM | **GPT-4o** (default) | Best balance of quality, speed, and cost; user can switch at runtime |
| Agent architecture | **Plug-and-play adapters** | Abstract interfaces + registry; users drop in a Python file to add any provider |
| Frontend framework | **Next.js + React** | SSR for fast load, Vercel AI SDK for streaming, huge ecosystem |
| PDF viewer | **react-pdf** | Mature, supports page navigation and text layers for highlighting |
| Streaming | **SSE** | Simpler than WebSockets for unidirectional streaming; native browser support |
| Provider config | **Settings UI + env vars** | Non-technical users use the UI; devs use `.env` — both paths supported |

# System Architecture Document
## Project: PolicyPulse AI — Intelligent Customer Complaint Response Assistant
**Team**: TENSOR TITANS | PS-40

---

## 1. Architectural Overview & System Topology

PolicyPulse AI is structured into four decoupled layers designed for modularity, strict policy compliance, and enterprise auditability.

```
+-----------------------------------------------------------------------------------+
|                              PRESENTATION LAYER                                   |
|   +-------------------------------------+   +---------------------------------+   |
|   |   SaaS Marketing Landing Page       |   |   Agent Review Studio           |   |
|   |   - MotionSites Editorial Aesthetics|   |   - Ticket Queue & Complaint View   |   |
|   |   - Interactive Complaint Preview   |   |   - Evidence & Citation Panel   |   |
|   |   - Guardrail & Metric Highlights   |   |   - Guardrail Safety Validator  |   |
|   +-------------------------------------+   +---------------------------------+   |
|        Stack: React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons   |
+------------------------------------------+----------------------------------------+
                                           | HTTPS / JSON REST API
+------------------------------------------v----------------------------------------+
|                          APPLICATION & ORCHESTRATION LAYER                        |
|   FastAPI Service (Python 3.11+, Pydantic v2, ASGI Uvicorn)                       |
|                                                                                   |
|   +-------------------------+    +-----------------------+    +----------------+  |
|   | Complaint Decomposer    |--->| Hybrid RAG Retriever  |--->| Policy Coverage|  |
|   | - Multi-issue extractor |    | - Semantic (pgvector) |    | Classifier     |  |
|   | - Sentiment & Severity  |    | - Lexical (FTS tsvec) |    | (6 states)     |  |
|   +-------------------------+    | - Reciprocal Fusion   |    +----------------+  |
|                                  +-----------------------+            |           |
|                                                                       v           |
|   +-------------------------+    +-----------------------+    +----------------+  |
|   | Response Dispatcher     |<---| Guardrail Validator   |<---| Grounded Draft |  |
|   | - Human approval audit  |    | - Commitment Blocker  |    | Generator      |  |
|   | - Webhook / Ticket push |    | - Citation Verifier   |    | - Tone presets |  |
|   +-------------------------+    +-----------------------+    +----------------+  |
+------------------------------------------+----------------------------------------+
                                           | SQL / pgvector / REST
+------------------------------------------v----------------------------------------+
|                              DATA & RETRIEVAL LAYER                               |
|   Supabase PostgreSQL 15+                                                         |
|   - pgvector extension: HNSW index over embeddings (vector_dim: 1536/768)         |
|   - Full-Text Search: GIN index over `to_tsvector('english', chunk_text)`         |
|   - Relational Tables: complaints, sub_concerns, policies, chunks, audit_logs     |
|   - Supabase Storage: Original policy manuals (PDF/Markdown)                      |
+-----------------------------------------------------------------------------------+
```

---

## 2. Component Layer Responsibilities

### 2.1 Presentation Layer (Frontend)
- **Deployment**: Vercel (Edge-optimized static single-page application).
- **Core Views**:
  - `LandingPage`: Editorial aesthetic inspired by MotionSites.ai, featuring typography contrast, floating navbar, live interactive complaint-analyzer playground, capability bento-grids, and direct CTAs.
  - `Workspace`: Review-console layout featuring ticket navigation sidebar, customer statement viewer, decomposed issue cards with status badges, side-by-side evidence citation viewer, commitment guardrail status, and human-in-the-loop action controls.
- **State Management**: Type-safe React state with API service fallback for interactive offline/local demo usage.

### 2.2 Orchestration Layer (Backend)
- **Deployment**: Render (Web Service running Uvicorn).
- **Sub-Services**:
  1. `Decomposer`: Parses compound complaints into structured concern entities with severity.
  2. `HybridRetriever`: Dispatches parallel queries to pgvector (cosine distance) and PostgreSQL FTS, merging scores via Reciprocal Rank Fusion ($k=60$).
  3. `CoverageClassifier`: Evaluates retrieved clauses against customer requests to assign states (`covered`, `partially_covered`, `uncovered`, `prohibited`, `conflict`, `needs_human_review`).
  4. `GroundedGenerator`: Uses prompt constraints to synthesize drafts quoting only retrieved clauses and supporting tone styles (`empathetic`, `concise`, `formal`).
  5. `GuardrailValidator`: Regex and semantic heuristic engine identifying unauthorized financial or policy promises.
  6. `AuditDispatcher`: Requires verified agent authorization before recording dispatch status.

### 2.3 Data Layer (Supabase)
- **Storage**: Raw policy documents stored in `policy-documents` Supabase bucket.
- **Relational Tables**: Complete normalized schema for complaints, concerns, policy documents, chunk embeddings, and agent review logs.
- **Hybrid Search Function**: Custom SQL function `hybrid_policy_search()` executing dense vector similarity and full-text keyword matching within a single round-trip.

---

## 3. Technology Stack Matrix

| Layer | Selected Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | React 18 + Vite + TypeScript | Lightning-fast HMR, strict type safety, zero bloat |
| **Styling & UI** | Tailwind CSS + shadcn/ui | Tailored dark-mode aesthetics, accessible UI primitives |
| **Icons** | Lucide React | Modern, consistent icon library |
| **Backend API** | Python 3.11 + FastAPI + Pydantic v2 | High-throughput async performance, automatic OpenAPI documentation |
| **Primary Database** | Supabase (PostgreSQL 15) | Managed cloud relational database with robust security |
| **Vector Engine** | pgvector extension | Native vector indexing (HNSW) within PostgreSQL |
| **Keyword Search** | PostgreSQL `tsvector` + `tsquery` | Built-in lexical retrieval with stemming and ranking |
| **Object Storage** | Supabase Storage | Document retention for audit and clause lineage |
| **Target Deployment** | Vercel (UI) + Render (API) | Cloud-native, zero-downtime, continuous deployment |

---

## 4. Security & Compliance Architecture
1. **Zero Secret Exposure**: Credentials stored in environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `EMBEDDING_API_KEY`).
2. **Deterministic Guardrails**: LLM output is parsed against an external ruleset to prevent unauthorized commitments regardless of prompt injection attempts.
3. **Immutable Audit Trail**: All agent review decisions, edits, and citations are captured in `dispatch_audit_logs`.

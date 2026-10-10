# RAG Pipeline Specification
## Project: PolicyPulse AI — Grounded Complaint Retrieval & Generation
**Team**: TENSOR TITANS | PS-40

---

## 1. Pipeline Overview & Objectives
The retrieval-augmented generation (RAG) pipeline is designed with a strict zero-hallucination constraint. In customer support, an ungrounded LLM statement (such as *"We will credit your account $100"*) constitutes an unauthorized legal commitment. 

The pipeline ensures:
1. Every draft sentence is grounded in retrieved enterprise policy clauses.
2. Compound tickets are decomposed into atomic concerns so no grievance is ignored.
3. Hybrid search combines semantic intent with exact keyword accuracy (e.g. tracking numbers, clause numbers, SKU codes).
4. Explicit coverage states prevent hallucinated assumptions.

```
[Raw Complaint]
      │
      ▼
1. Multi-Concern Decomposition ──► [Concern 1, Concern 2, Concern 3]
                                            │
                                            ▼
2. Parallel Hybrid Retrieval ─────► Semantic Search (pgvector) + Lexical (Postgres FTS)
                                            │
                                            ▼
3. Reciprocal Rank Fusion ────────► Top-K Grounded Policy Chunks (RRF k=60)
                                            │
                                            ▼
4. Coverage State Classifier ─────► covered | partially_covered | prohibited | ...
                                            │
                                            ▼
5. Grounded Draft Generator ──────► Tone Engine (Empathetic / Concise / Formal)
                                            │
                                            ▼
6. Commitment & Safety Blocker ───► Verifies zero unauthorized promises
                                            │
                                            ▼
7. Human Review Console ──────────► Support Agent approves, edits, or escalates
```

---

## 2. Ingestion & Chunking Strategy

### 2.1 Document Preprocessing
- Enterprise manuals are ingested from PDF or Markdown files into Supabase Storage.
- Rather than naive fixed-token sliding windows, chunking is **clause-aware**:
  - Primary boundary: Header level 2/3 (`## Section`, `### Clause`)
  - Sub-boundary: Numbered clauses (e.g., `Clause 3.2`)
  - Metadata preservation: `document_title`, `clause_id`, `section_name`, `page_number`, `effective_date`.

### 2.2 Embedding Generation
- Text chunks are embedded using hosted embedding models (e.g., OpenAI `text-embedding-3-small` [1536 dim] or Gemini `text-embedding-004` [768 dim]).
- Embeddings are stored in the `policy_chunks.embedding` vector column with an HNSW index using cosine distance (`vector_cosine_ops`).

---

## 3. Hybrid Retrieval & Reciprocal Rank Fusion (RRF)

### 3.1 Why Hybrid Search?
- **Dense Vector Search (pgvector)** captures paraphrased meaning and customer emotions (e.g., *"the machine is spraying water everywhere"* matches *"hardware defect / leak"*).
- **Lexical Search (PostgreSQL FTS)** captures exact policy terms, legal clauses, model numbers, and SLA timelines (e.g., *"14 days"*, *"Clause 3.2"*, *"FedEx delay"*).

### 3.2 Reciprocal Rank Fusion Formula
For each chunk $d$ in the top retrieved candidates:
$$RRF(d) = \sum_{m \in \{semantic, fts\}} \frac{1}{k + r_m(d)}$$
Where:
- $k$ is the smoothing constant (default: $60$, standard in Information Retrieval to prevent high rank bias).
- $r_m(d)$ is the 1-based rank position of chunk $d$ in retrieval system $m$.

Chunks appearing in both semantic and keyword top-10 lists receive exponential boosts in ranking.

---

## 4. Issue Coverage Classification Rules

The retriever supplies top chunks to the Classifier, which assigns one of six deterministic states:

| State | Definition | Example Scenario |
| :--- | :--- | :--- |
| `covered` | Specific active policy authorizes the exact resolution requested. | Damaged item within 14 days of delivery receipt (Clause 3.2). |
| `partially_covered` | Policy applies to the category, but prerequisites or limits constrain the resolution. | Delayed shipment over 48 hours credits shipping fee only, not item cost (Clause 2.1). |
| `uncovered` | Active manuals contain no relevant guidance on the situation. | Customer requests courier driver to be reassigned to a different residential route. |
| `prohibited` | Active policy explicitly denies or forbids the requested claim. | Frontline agent issuing $100 discretionary cash compensation without VP signoff (Clause 7.1). |
| `conflict` | Multiple active documents give contradictory directives. | SLA states 30-day return window, but promotional invoice states final sale non-returnable. |
| `needs_human_review`| High ambiguity, severe monetary exposure, or threat of legal escalation. | Customer hints at regulatory lawsuit or physical injury caused by electrical appliance. |

---

## 5. Grounded Generation & Citation Anchoring
1. **Prompt Isolation**: The generation prompt receives strictly the decomposed concerns and the text of retrieved chunks. The system prompt instructs:
   > *"You are an AI assistant drafting on behalf of enterprise customer support. You must only reference facts explicitly stated in the provided policy excerpts. Never fabricate store credits, refunds, or exceptions."*
2. **Citation Markers**: Each substantive sentence in the drafted response is tagged with an anchor clause reference (e.g., `[Clause 3.2]`).
3. **Tone Adaptation**:
   - `empathetic`: Validates customer inconvenience first, apologizes for service friction, clearly details authorized relief.
   - `concise`: Directly states resolution outcome, requirements, and next steps in 3-4 sentences.
   - `formal`: Strictly adheres to professional contractual language and policy section references.

---

## 6. Commitment Detection Guardrail
Before returning the draft to the frontend:
1. An independent validator evaluates the generated text.
2. It detects promises of cash, credits, replacements, or free upgrades using rule heuristics and semantic verification against retrieved policies.
3. If a promise does not have a supporting `covered` clause in the citations, the response status is marked `FLAGGED`, and the claim is highlighted in amber/red for agent review.

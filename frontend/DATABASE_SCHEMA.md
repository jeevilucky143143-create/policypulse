# Database Schema Specification
## Project: PolicyPulse AI — Intelligent Customer Complaint Response Assistant
**Target Platform**: Supabase (PostgreSQL 15+) with `pgvector` extension

---

## 1. Schema Extensions & Settings

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector for semantic embeddings
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Trigram matching for fuzzy lookup
```

---

## 2. Table Definitions

### 2.1 `policies`
Master registry of enterprise policy manuals, terms of service, and regulatory guidelines.

```sql
CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_code VARCHAR(64) UNIQUE NOT NULL,       -- e.g., 'POL-REFUND-2026'
    title VARCHAR(255) NOT NULL,                  -- e.g., 'Enterprise Refund & Return Policy'
    version VARCHAR(32) NOT NULL,                 -- e.g., 'v2.4'
    category VARCHAR(64) NOT NULL,                -- e.g., 'Billing', 'Fulfillment', 'Conduct'
    storage_path TEXT,                            -- Supabase Storage bucket path
    effective_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 `policy_chunks`
Granular textual sections and clauses extracted from policy manuals, indexed for both dense vector search and full-text keyword retrieval.

```sql
CREATE TABLE policy_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID REFERENCES policies(id) ON DELETE CASCADE,
    clause_id VARCHAR(128) NOT NULL,             -- e.g., 'Clause 3.2 (Transit Damage)'
    section_name VARCHAR(255) NOT NULL,          -- e.g., 'Section 3: Damaged or Defective Items'
    page_number INT,
    chunk_text TEXT NOT NULL,
    token_count INT,
    
    -- Dense Embedding (1536 dims for text-embedding-3-small or 768 for gemini-embedding-001)
    embedding vector(1536),
    
    -- Full-Text Search representation
    fts_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW Vector Index for sub-millisecond approximate nearest neighbor lookup
CREATE INDEX idx_policy_chunks_embedding_hnsw 
ON policy_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- GIN Index for PostgreSQL Full-Text Search
CREATE INDEX idx_policy_chunks_fts 
ON policy_chunks USING gin (fts_vector);
```

### 2.3 `complaints`
Inbound customer complaint tickets ingested via API, email, or ticketing webhooks.

```sql
CREATE TABLE complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_code VARCHAR(64) UNIQUE NOT NULL,   -- e.g., 'CMP-2026-9042'
    customer_id VARCHAR(64) NOT NULL,
    customer_name VARCHAR(128) NOT NULL,
    channel VARCHAR(32) DEFAULT 'email',
    raw_text TEXT NOT NULL,
    overall_sentiment VARCHAR(32),                -- 'negative', 'neutral', 'frustrated'
    overall_severity VARCHAR(32),                 -- 'low', 'medium', 'high', 'critical'
    status VARCHAR(32) DEFAULT 'PENDING_REVIEW',  -- 'PENDING_REVIEW', 'APPROVED', 'ESCALATED', 'DISPATCHED'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.4 `decomposed_concerns`
Sub-issues isolated from the compound complaint during multi-concern decomposition.

```sql
CREATE TABLE decomposed_concerns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
    concern_index INT NOT NULL,                   -- Order of appearance (1, 2, 3...)
    category VARCHAR(64) NOT NULL,                -- e.g., 'Damaged Merchandise'
    summary TEXT NOT NULL,
    severity VARCHAR(32) NOT NULL,
    coverage_status VARCHAR(32) NOT NULL,         -- 'covered', 'partially_covered', 'uncovered', 'prohibited', 'conflict', 'needs_human_review'
    rationale TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.5 `citations`
Auditable links between decomposed concerns and retrieved policy clauses.

```sql
CREATE TABLE citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concern_id UUID REFERENCES decomposed_concerns(id) ON DELETE CASCADE,
    chunk_id UUID REFERENCES policy_chunks(id),
    relevance_score FLOAT NOT NULL,               -- RRF fused score (0.0 - 1.0)
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.6 `guardrail_scans`
Safety audit logs tracking unsupported commitments and policy violation checks.

```sql
CREATE TABLE guardrail_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
    verdict VARCHAR(16) NOT NULL,                 -- 'PASSED' or 'FLAGGED'
    detected_claims JSONB DEFAULT '[]',           -- e.g. [{"claim": "$100 gift card", "rule": "Clause 7.1"}]
    risk_level VARCHAR(32) NOT NULL,              -- 'NONE', 'LOW', 'MEDIUM', 'CRITICAL'
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.7 `dispatch_audit_logs`
Immutable compliance records documenting the human agent's approval, edits, and final dispatch.

```sql
CREATE TABLE dispatch_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
    agent_id VARCHAR(64) NOT NULL,
    agent_name VARCHAR(128) NOT NULL,
    action VARCHAR(32) NOT NULL,                  -- 'APPROVE', 'REJECT', 'ESCALATE'
    final_response_text TEXT NOT NULL,
    agent_notes TEXT,
    dispatched_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. Hybrid Search Stored Procedure (RRF)

```sql
CREATE OR REPLACE FUNCTION hybrid_policy_search (
    query_text TEXT,
    query_embedding vector(1536),
    match_count INT DEFAULT 5,
    rrf_k INT DEFAULT 60
)
RETURNS TABLE (
    chunk_id UUID,
    clause_id VARCHAR,
    section_name VARCHAR,
    chunk_text TEXT,
    page_number INT,
    combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH semantic_results AS (
        SELECT 
            id,
            ROW_NUMBER() OVER (ORDER BY embedding <=> query_embedding) AS rank
        FROM policy_chunks
        ORDER BY embedding <=> query_embedding
        LIMIT match_count * 2
    ),
    fts_results AS (
        SELECT 
            id,
            ROW_NUMBER() OVER (ORDER BY ts_rank(fts_vector, plainto_tsquery('english', query_text)) DESC) AS rank
        FROM policy_chunks
        WHERE fts_vector @@ plainto_tsquery('english', query_text)
        ORDER BY ts_rank(fts_vector, plainto_tsquery('english', query_text)) DESC
        LIMIT match_count * 2
    ),
    fused_scores AS (
        SELECT 
            COALESCE(s.id, f.id) AS id,
            COALESCE(1.0 / (rrf_k + s.rank), 0.0) + COALESCE(1.0 / (rrf_k + f.rank), 0.0) AS rrf_score
        FROM semantic_results s
        FULL OUTER JOIN fts_results f ON s.id = f.id
    )
    SELECT 
        c.id AS chunk_id,
        c.clause_id,
        c.section_name,
        c.chunk_text,
        c.page_number,
        fs.rrf_score::FLOAT AS combined_score
    FROM fused_scores fs
    JOIN policy_chunks c ON c.id = fs.id
    ORDER BY fs.rrf_score DESC
    LIMIT match_count;
END;
$$;
```

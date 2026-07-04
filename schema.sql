-- recall — Supabase schema
-- Run this in the Supabase SQL Editor on a dedicated project.
-- Dense vectors (pgvector) + lexical full-text (Postgres FTS) in one store,
-- fused with Reciprocal Rank Fusion. For a prose corpus, dense is the primary
-- signal; lexical rescues exact names/terms. Results carry book metadata so the
-- app can attribute each synthesised claim to its source.

create extension if not exists vector;

-- ── Tables ────────────────────────────────────────────────────────────────

create table if not exists documents (
    id          uuid primary key default gen_random_uuid(),
    title       text not null,
    author      text,
    source      text,                     -- e.g. Project Gutenberg URL / ebook id
    format      text not null default 'text',
    created_at  timestamptz not null default now()
);

create table if not exists chunks (
    id            uuid primary key default gen_random_uuid(),
    document_id   uuid not null references documents(id) on delete cascade,
    content       text not null,
    section_title text,                    -- chapter/section if detectable (nullable)
    chunk_index   int  not null,           -- order within the book (enables v2 neighbour expansion)
    token_count   int,
    embedding     vector(768),             -- gemini-embedding-001 @ 768 dims
    fts           tsvector generated always as (to_tsvector('english', content)) stored,
    created_at    timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────
-- HNSW works up to 2000 dims — this is exactly why we embed at 768, not 3072.
create index if not exists chunks_embedding_idx
    on chunks using hnsw (embedding vector_cosine_ops);

create index if not exists chunks_fts_idx
    on chunks using gin (fts);

create index if not exists chunks_document_id_idx
    on chunks (document_id);

-- Helps future neighbour-window (whole-idea) expansion: WHERE document_id = ?
-- AND chunk_index BETWEEN ? AND ?
create index if not exists chunks_doc_order_idx
    on chunks (document_id, chunk_index);

-- ── Hybrid search (dense + lexical, fused with RRF) ─────────────────────────
-- Returns the top `match_count` passages by fused rank, carrying book title +
-- author for citation. RRF fuses on rank alone (no score normalisation needed):
--   score = sum over lists of 1 / (rrf_k + rank).

create or replace function hybrid_search(
    query_embedding vector(768),
    query_text      text,
    match_count     int   default 30,
    rrf_k           int   default 60
)
returns table (
    id            uuid,
    document_id   uuid,
    title         text,
    author        text,
    section_title text,
    content       text,
    dense_rank    int,
    lexical_rank  int,
    rrf_score     double precision
)
language sql stable
as $$
    with dense as (
        select c.id,
               row_number() over (order by c.embedding <=> query_embedding) as rank
        from chunks c
        where c.embedding is not null
        order by c.embedding <=> query_embedding
        limit match_count
    ),
    lexical as (
        select c.id,
               row_number() over (
                   order by ts_rank_cd(c.fts, plainto_tsquery('english', query_text)) desc
               ) as rank
        from chunks c
        where c.fts @@ plainto_tsquery('english', query_text)
        order by ts_rank_cd(c.fts, plainto_tsquery('english', query_text)) desc
        limit match_count
    )
    select
        c.id,
        c.document_id,
        d.title,
        d.author,
        c.section_title,
        c.content,
        de.rank as dense_rank,
        le.rank as lexical_rank,
        coalesce(1.0 / (rrf_k + de.rank), 0.0)
      + coalesce(1.0 / (rrf_k + le.rank), 0.0) as rrf_score
    from chunks c
    join documents d on d.id = c.document_id
    left join dense   de on de.id = c.id
    left join lexical le on le.id = c.id
    where de.id is not null or le.id is not null
    order by rrf_score desc
    limit match_count;
$$;

-- Dense-only variant (ablation baseline: dense -> +hybrid -> +rerank).
create or replace function dense_search(
    query_embedding vector(768),
    match_count     int default 30
)
returns table (
    id            uuid,
    document_id   uuid,
    title         text,
    author        text,
    section_title text,
    content       text,
    distance      double precision
)
language sql stable
as $$
    select c.id, c.document_id, d.title, d.author, c.section_title, c.content,
           (c.embedding <=> query_embedding) as distance
    from chunks c
    join documents d on d.id = c.document_id
    where c.embedding is not null
    order by c.embedding <=> query_embedding
    limit match_count;
$$;

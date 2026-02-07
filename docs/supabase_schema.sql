-- Daily Paper Reader - Supabase 最小可用表结构
-- 用途：
-- 1) arxiv_papers：公共论文元数据池（供客户端只读查询）
-- 当前默认无状态模式：不依赖 arxiv_sync_status。

create extension if not exists vector;

create table if not exists public.arxiv_papers (
  id text primary key,
  title text not null default '',
  abstract text not null default '',
  authors jsonb not null default '[]'::jsonb,
  primary_category text,
  categories jsonb not null default '[]'::jsonb,
  published timestamptz,
  link text,
  embedding vector(384),
  embedding_model text,
  embedding_dim integer,
  embedding_updated_at timestamptz,
  source text not null default 'supabase',
  updated_at timestamptz not null default now()
);

create index if not exists idx_arxiv_papers_published
  on public.arxiv_papers (published desc);

-- 向量索引（余弦距离）
create index if not exists idx_arxiv_papers_embedding_cosine
  on public.arxiv_papers using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 建议 RLS：
-- 1) 对 anon 开放 arxiv_papers 的 SELECT
-- 2) 写入仅 service_role

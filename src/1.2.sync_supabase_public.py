#!/usr/bin/env python
# 将当天抓取的 arXiv 元数据（含 embedding）同步到 Supabase 公共库

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List
import requests
from sentence_transformers import SentenceTransformer

try:
    import yaml  # type: ignore
except Exception:  # pragma: no cover
    yaml = None


SCRIPT_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
TODAY_STR = datetime.now(timezone.utc).strftime("%Y%m%d")
CONFIG_FILE = os.path.join(ROOT_DIR, "config.yaml")
DEFAULT_EMBED_MODEL = "BAAI/bge-small-en-v1.5"


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def _norm(v: Any) -> str:
    return str(v or "").strip()


def _base_rest(url: str) -> str:
    return _norm(url).rstrip("/") + "/rest/v1"


def _headers(service_key: str, prefer: str | None = None) -> Dict[str, str]:
    h = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_config() -> Dict[str, Any]:
    if yaml is None or not os.path.exists(CONFIG_FILE):
        return {}
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def resolve_embed_model(args_model: str) -> str:
    arg_model = _norm(args_model)
    if arg_model:
        return arg_model
    cfg = load_config()
    ef = (cfg.get("embedding_filter") or {}) if isinstance(cfg, dict) else {}
    model = _norm((ef or {}).get("model_name") or "")
    return model or DEFAULT_EMBED_MODEL


def build_embedding_text(row: Dict[str, Any]) -> str:
    title = _norm(row.get("title"))
    abstract = _norm(row.get("abstract"))
    if title and abstract:
        return f"passage: Title: {title}\n\nAbstract: {abstract}"
    if title:
        return f"passage: Title: {title}"
    if abstract:
        return f"passage: Abstract: {abstract}"
    return ""


def to_pgvector_literal(vec: List[float]) -> str:
    return "[" + ",".join(f"{float(x):.8f}" for x in vec) + "]"


def attach_embeddings(
    rows: List[Dict[str, Any]],
    *,
    model_name: str,
    device: str,
    batch_size: int,
    max_length: int,
) -> int:
    if not rows:
        return 0

    log(f"[Embedding] 加载模型：{model_name}（device={device}）")
    model = SentenceTransformer(model_name, device=device)
    if max_length > 0 and hasattr(model, "max_seq_length"):
        try:
            model.max_seq_length = max_length
        except Exception:
            pass

    texts = [build_embedding_text(r) for r in rows]
    log(f"[Embedding] 开始编码：{len(texts)} 条")
    emb = model.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
        batch_size=max(int(batch_size or 8), 1),
        show_progress_bar=False,
    )

    if len(emb.shape) != 2 or emb.shape[0] != len(rows):
        raise RuntimeError("embedding 输出维度异常")

    dim = int(emb.shape[1])
    now_iso = _now_iso()
    for idx, row in enumerate(rows):
        vec = emb[idx].tolist()
        row["embedding"] = to_pgvector_literal(vec)
        row["embedding_model"] = model_name
        row["embedding_dim"] = dim
        row["embedding_updated_at"] = now_iso
    log(f"[Embedding] 编码完成：dim={dim}")
    return dim


def load_raw(path: str) -> List[Dict[str, Any]]:
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f) or []
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    except Exception:
        return []
    return []


def normalize_paper(x: Dict[str, Any]) -> Dict[str, Any] | None:
    pid = _norm(x.get("id"))
    if not pid:
        return None
    return {
        "id": pid,
        "title": _norm(x.get("title")),
        "abstract": _norm(x.get("abstract")),
        "authors": x.get("authors") if isinstance(x.get("authors"), list) else [],
        "primary_category": _norm(x.get("primary_category")) or None,
        "categories": x.get("categories") if isinstance(x.get("categories"), list) else [],
        "published": _norm(x.get("published")) or None,
        "link": _norm(x.get("link")) or None,
        "source": _norm(x.get("source") or "supabase"),
        "updated_at": _now_iso(),
    }


def upsert_papers(
    *,
    url: str,
    service_key: str,
    table: str,
    rows: List[Dict[str, Any]],
    batch_size: int = 500,
) -> None:
    rest = _base_rest(url)
    endpoint = f"{rest}/{table}?on_conflict=id"
    total = len(rows)
    if total == 0:
        return
    for i in range(0, total, batch_size):
        chunk = rows[i : i + batch_size]
        resp = requests.post(
            endpoint,
            headers=_headers(service_key, "resolution=merge-duplicates"),
            data=json.dumps(chunk, ensure_ascii=False),
            timeout=30,
        )
        if resp.status_code >= 300:
            raise RuntimeError(f"upsert papers 失败：HTTP {resp.status_code} {resp.text[:200]}")
        log(f"[Supabase] upsert papers: {min(i + batch_size, total)}/{total}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync raw arXiv papers to Supabase public tables.")
    parser.add_argument("--date", type=str, default=TODAY_STR, help="YYYYMMDD")
    parser.add_argument("--url", type=str, default=os.getenv("SUPABASE_URL", ""))
    parser.add_argument("--service-key", type=str, default=os.getenv("SUPABASE_SERVICE_KEY", ""))
    parser.add_argument("--papers-table", type=str, default=os.getenv("SUPABASE_PAPERS_TABLE", "arxiv_papers"))
    parser.add_argument("--embed-model", type=str, default="")
    parser.add_argument("--embed-device", type=str, default="cpu")
    parser.add_argument("--embed-batch-size", type=int, default=8)
    parser.add_argument("--embed-max-length", type=int, default=0)
    parser.add_argument("--with-embeddings", dest="with_embeddings", action="store_true", default=True)
    parser.add_argument("--no-embeddings", dest="with_embeddings", action="store_false")
    parser.add_argument("--mode", type=str, default="standard")
    args = parser.parse_args()

    url = _norm(args.url)
    key = _norm(args.service_key)
    if not url or not key:
        log("[INFO] SUPABASE_URL / SUPABASE_SERVICE_KEY 未配置，跳过同步。")
        return

    raw_path = os.path.join(ROOT_DIR, "archive", args.date, "raw", f"arxiv_papers_{args.date}.json")
    rows_raw = load_raw(raw_path)
    rows = [r for r in (normalize_paper(x) for x in rows_raw) if r]

    try:
        if args.with_embeddings:
            model_name = resolve_embed_model(args.embed_model)
            attach_embeddings(
                rows,
                model_name=model_name,
                device=_norm(args.embed_device) or "cpu",
                batch_size=int(args.embed_batch_size or 8),
                max_length=int(args.embed_max_length or 0),
            )
        else:
            log("[Embedding] 已禁用 embedding 同步（--no-embeddings）")

        upsert_papers(
            url=url,
            service_key=key,
            table=args.papers_table,
            rows=rows,
        )
        log(f"[OK] Supabase 同步完成：{len(rows)} 篇")
    except Exception as e:
        log(f"[ERROR] Supabase 同步失败：{e}")
        raise


if __name__ == "__main__":
    main()

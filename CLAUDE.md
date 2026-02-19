# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Daily Paper Reader 是一个 AI 驱动的学术论文自动化推荐系统，从 ArXiv 抓取、筛选、排序和展示论文。采用 Fork 即用设计，用户 Fork 后即可拥有个性化论文推荐网站。

## 常用命令

```bash
# 安装依赖
pip install -r requirements.txt

# 运行完整流水线 (步骤 0-6)
python src/main.py

# 带参数运行
python src/main.py --run-enrich                    # 先运行配置增强
python src/main.py --embedding-device cuda         # 使用 GPU 加速嵌入
python src/main.py --fetch-days 7                  # 抓取最近 7 天论文
python src/main.py --fetch-ignore-seen             # 忽略已见论文记录

# 运行单个步骤
python src/0.enrich_config_queries.py              # 配置查询增强
python src/1.fetch_paper_arxiv.py                  # ArXiv 论文抓取
python src/2.1.retrieval_papers_bm25.py            # BM25 检索
python src/2.2.retrieval_papers_embedding.py       # 嵌入向量检索
python src/2.3.retrieval_papers_rrf.py             # RRF 融合
python src/3.rank_papers.py                        # 重排序
python src/4.llm_refine_papers.py                  # LLM 精炼
python src/5.select_papers.py                      # 论文选择
python src/6.generate_docs.py                      # 生成文档网站
```

## 协作约定

- 每次完成代码改动后，默认先执行一次 `git commit`，不例外。  
- 默认 commit 提交说明请按约定前缀：
  - `[update] xxx`：功能/业务更新
  - `[fix] xxx`：问题修复
  - `[beautify] xxx`：重构/美化/优化

## 架构概览

### 后端流水线 (Python - `src/`)

处理流程按编号顺序执行：
1. **Step 0** - `0.enrich_config_queries.py`: LLM 增强用户查询，生成模糊关键词
2. **Step 1** - `1.fetch_paper_arxiv.py`: 从 ArXiv API 抓取论文
3. **Step 2** - 多阶段检索：
   - `2.1.retrieval_papers_bm25.py`: BM25 关键词检索
   - `2.2.retrieval_papers_embedding.py`: Qwen3-Embedding-0.6B 向量检索
   - `2.3.retrieval_papers_rrf.py`: 倒数排名融合 (RRF)
4. **Step 3** - `3.rank_papers.py`: Qwen3-Reranker-4b 重排序
5. **Step 4** - `4.llm_refine_papers.py`: LLM 生成摘要和评分
6. **Step 5** - `5.select_papers.py`: 根据评分选择最终论文
7. **Step 6** - `6.generate_docs.py`: 生成 Docsify 格式网站

核心模块：
- `llm.py`: LLM API 调用封装，支持多个提供商
- `filter.py`: 论文过滤逻辑

### 前端应用 (JavaScript - `app/`)

基于 Docsify 的单页应用：
- `docsify-plugin.js`: Docsify 插件配置和初始化
- `chat.discussion.js`: AI 聊天讨论功能
- `secret.session.js`: API 密钥加密存储
- `subscriptions.*.js`: 订阅管理模块（关键词、Zotero、论文追踪）
- `workflows.runner.js`: GitHub Actions 工作流触发器
- `ui.layout-and-subscriptions-entry.js`: UI 布局入口

### 数据目录

- `docs/`: 生成的网站内容（按日期 `YYYYMM/DD/` 组织）
- `archive/`: 运行数据存档
  - `*/raw/`: 原始抓取数据（流程后清理）
  - `*/filtered/`: 过滤结果（流程后清理）
  - `*/rank/`: 排序结果（流程后清理）
  - `*/recommend/`: 最终推荐结果（保留）
  - `arxiv_seen.json`: 已处理论文 ID 记录
  - `carryover.json`: 跨日期保留数据
  - `crawl_state.json`: 爬取状态

### 配置文件

- `config.yaml`: 用户配置（订阅关键词、LLM 查询、ArXiv 设置）
- `index.html`: 网站入口，加载 Docsify 和前端模块

## 技术栈

- **后端**: Python 3.11, openai, arxiv, sentence-transformers, numpy, pymupdf
- **前端**: Docsify, KaTeX (数学公式), js-yaml, libsodium (加密)
- **AI 模型**: Qwen3-Embedding-0.6B, Qwen3-Reranker-4b, 多 LLM 提供商

## GitHub Actions

- `daily-paper-reader.yml`: 每日 UTC 02:30 自动运行流水线
- `sync.yml`: 自动同步上游代码更新

---
title: "How Cursor's Code Embedding Pipeline Works"
description: "End-to-end breakdown of how Cursor turns your codebase into searchable vectors — from AST chunking to Turbopuffer retrieval."
---

When a coding agent receives a prompt like "where do we handle authentication?", it needs to find the right code across potentially tens of thousands of files. Grep works for exact matches but fails for semantic queries. Cursor's embedding system converts the entire codebase into searchable vectors so the agent can **retrieve code by meaning, not just text**.

Cursor's own A/B tests show the impact:
- **12.5% higher accuracy** on average (6.5%–23.5% depending on model)
- **2.6% more code retention** on large codebases (1000+ files)
- **2.2% fewer dissatisfied follow-up requests**
- Accuracy increase across **all frontier coding models tested**

Here's how the full pipeline works, phase by phase.

## Phase 1: Code Chunking (Client-Side)

Cursor doesn't embed whole files — it splits them into **semantically meaningful chunks** using **tree-sitter** to parse source code into an Abstract Syntax Tree (AST).

Instead of seeing code as raw text, the system sees it as a tree of logical structures. The chunker traverses AST nodes and groups adjacent ones until a token limit is reached:

- **Splits happen between functions**, not inside them
- **Splits happen between statements**, not mid-line
- Each chunk is a **complete, coherent unit** (a function, a class, a logical block)

Different languages have different semantic boundaries:

| Language | Node Types Used for Splitting |
|----------|-------------------------------|
| **Python** | `function_definition`, `class_definition`, `decorated_definition`, `async_function_definition` |
| **JavaScript** | `function_declaration`, `arrow_function`, `class_declaration`, `method_definition`, `export_statement` |
| **TypeScript** | Same as JS + `interface_declaration`, `type_alias_declaration` |
| **Java** | `method_declaration`, `class_declaration`, `interface_declaration`, `constructor_declaration` |
| **Go** | `function_declaration`, `method_declaration`, `type_declaration`, `var_declaration`, `const_declaration` |
| **Rust** | `function_item`, `impl_item`, `struct_item`, `enum_item`, `trait_item`, `mod_item` |
| **C/C++** | `function_definition`, `class_specifier`, `namespace_definition`, `declaration` |

For unsupported languages, Cursor falls back to rule-based splitters using regex, indentation, and token heuristics.

**Why this matters:** A naive word-count splitter (like DeepWiki-Open's 350-word chunks) can cut a function in half mid-logic. AST-based chunking guarantees each chunk is a complete semantic unit — the embedding captures the meaning of a whole function, not half of one.

## Phase 2: Custom Embedding Model

This is where Cursor diverges from everyone else. They don't use OpenAI's `text-embedding-3-small` or any off-the-shelf model — they trained **their own embedding model** optimized for code retrieval.

The training methodology is unique:

1. **Collect agent sessions** — when coding agents work through tasks, they perform multiple searches and open files before finding the right code
2. **Retrospective analysis** — an LLM analyzes these traces and ranks what content **would have been most helpful** at each step
3. **Train embeddings to match rankings** — the model is trained so its similarity scores align with the LLM-generated relevance rankings

This creates a **self-improving feedback loop**: better embeddings → agent finds code faster → better traces → better training data → even better embeddings. The model learns "when a developer is working on X, they usually need to find Y" — and encodes that relationship into the embedding space.

Each chunk is embedded **as a whole unit** (not token-by-token), capturing the full semantic context of that code block.

**Practical tip:** Code comments and docstrings are disproportionately important — they bridge natural language queries and code. A good file-level comment explaining what a module does dramatically improves retrieval quality.

## Phase 3: Privacy & Path Obfuscation

Before data leaves the client:

- **File paths are obfuscated** client-side using a secret key + nonce
  - `src/payments/invoice_processor.py` → `a9f3/x72k/qp1m8d.f4`
  - Directory structure shape is preserved (for filtering), but actual names are hidden
- Each codebase gets its own **namespace** with a unique vector transformation
- **No plaintext code is ever stored server-side** — only embeddings + obfuscated metadata
- `.cursorignore` lets you exclude sensitive files entirely

## Phase 4: Storage in Turbopuffer

Embeddings are stored in **Turbopuffer** — a serverless search engine backed by AWS S3.

- Each codebase = separate namespace
- Per vector: the embedding, obfuscated file path, and line range
- Embeddings are also **cached in AWS by chunk content hash** — unchanged code doesn't need re-embedding

Turbopuffer uses **SPFresh** (centroid-based clustered index) instead of the more common HNSW (graph-based). The key advantage for object storage:

| Approach | Round Trips to Storage | Suited For |
|----------|----------------------|------------|
| **HNSW** (graph) | Many small hops | In-memory databases |
| **SPFresh** (clustered) | 2-4 big fetches | Object storage (S3) |

Performance: cold query ~343ms (first access), warm query **~8ms** (cached on NVMe/RAM). Since Cursor has tens of millions of namespaces (one per codebase per user), the S3-first architecture keeps costs ~95% lower than traditional vector databases.

## Phase 5: Incremental Updates via Merkle Trees

Instead of re-indexing everything on every change, Cursor uses **Merkle trees** — a hierarchical hash structure where:
- Each leaf = SHA-256 hash of a file
- Each parent = hash of its children's hashes
- The root = fingerprint of the entire codebase

Every ~5 minutes, Cursor compares client and server Merkle trees. Only **divergent branches** get synced — in a 50K-file repo, this avoids moving ~3.2 MB per update.

| File State | Action |
|-----------|--------|
| New files | Chunked, embedded, added to index |
| Modified files | Old embeddings removed, new ones created |
| Deleted files | Purged from index |
| Large/complex files | May be skipped for performance |

## Phase 6: Team Index Reuse via Simhash

Clones of the same codebase average **92% similarity** across users in an organization. Cursor exploits this:

1. New user's client computes a **simhash** (similarity hash) from its Merkle tree
2. Server finds existing team indexes that match above a threshold
3. Matched index is **copied** as a starting point
4. New user can query immediately while background sync reconciles differences

Access control: the client's Merkle tree hashes act as cryptographic proofs. If the client can't prove it has a file, that result is dropped from search.

| Percentile | Without Reuse | With Reuse |
|-----------|--------------|------------|
| Median | 7.87 seconds | 525 milliseconds |
| 90th percentile | 2.82 minutes | 1.87 seconds |
| **99th percentile** | **4.03 hours** | **21 seconds** |

## Phase 7: Retrieval at Query Time

When you ask `@codebase where do we handle authentication?`:

1. **Query embedding** — your query is converted to a vector using the same custom model
2. **Nearest-neighbor search** — Turbopuffer finds the most similar code chunks
3. **Results returned** — only obfuscated paths + line ranges (no code)
4. **Local code retrieval** — the client reads actual code from your local disk
5. **LLM context injection** — retrieved chunks are provided alongside the query to the LLM

Cursor also uses **hybrid search** — combining semantic search with grep/ripgrep for exact string matches. The combination outperforms either alone.

## Architecture Summary

```
CLIENT (VS Code Fork)
  1. Scan workspace (respect .cursorignore)
  2. Parse with tree-sitter → AST
  3. Chunk at semantic boundaries
  4. Compute Merkle tree of file hashes
  5. Obfuscate file paths
  6. Send chunks + metadata to server
  
  At query time:
  → Receive obfuscated paths + line ranges
  → Read actual code from local disk
  → Send code chunks to LLM as context

SERVER
  7. Embed chunks with custom model
  8. Cache embeddings by chunk hash (AWS)
  9. Store in Turbopuffer (per-codebase namespace)
  10. Sync Merkle trees every ~5 min
  11. Match team indexes via simhash
  
  At query time:
  → Embed query with same model
  → ANN search in Turbopuffer
  → Filter by client's Merkle tree proofs
  → Return obfuscated paths + line ranges
```

## What You Can Replicate (Open-Source Path)

| Component | Open-Source Option |
|-----------|--------------------|
| AST chunking | Chonkie (tree-sitter) or claude-context |
| Embedding | `text-embedding-3-large` at 1024 dims, VoyageCode3, or Nomic Embed Code |
| Vector storage | FAISS, Qdrant, or Weaviate |
| Change detection | git diff + file hashing |
| Caching | SQLite or file-based, keyed by chunk content hash |
| Hybrid search | Combine vector search with ripgrep |

## What You Can't (Cursor's Moat)

1. **Custom embedding model** trained on proprietary agent session traces
2. **Self-improving feedback loop** — more users → better traces → better model
3. **Turbopuffer at scale** — tens of millions of namespaces
4. **Team index sharing** — requires multi-user platform

## Sources

- [Cursor: Improving agent with semantic search](https://cursor.com/blog/semsearch)
- [Cursor: Securely indexing large codebases](https://cursor.com/blog/secure-codebase-indexing)
- [Towards Data Science: How Cursor Actually Indexes Your Codebase](https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/) (Jan 2026)
- [Shrivu Shankar: How Cursor (AI IDE) Works](https://blog.sshh.io/p/how-cursor-ai-ide-works) (Mar 2025)
- [BitPeak: Deep dive into vibe coding](https://bitpeak.com/how-cursor-works-deep-dive-into-vibe-coding/) (Oct 2025)
- [Praveen Rajagopal: I Reverse-Engineered Cursor](https://medium.com/@praveenrajagopal45/i-reverse-engineered-cursor-this-is-how-it-understands-your-entire-codebase-5457890c676a) (Dec 2025)

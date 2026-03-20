---
title: "Inside Cursor's Embedding Model: Training, Math & Replication"
description: "Deep dive into how Cursor trains their custom code embedding model — contrastive learning, hard negatives, Turbopuffer internals, and how to build your own."
---

This is a companion to [How Cursor's Code Embedding Pipeline Works](/ai/cursor-embedding-pipeline/), going deeper into the embedding model itself — the architecture, training methodology, math, and how to replicate it.

## What Is a Code Embedding?

An embedding is a dense numerical vector that represents the meaning of code in a high-dimensional space. The key property: **semantically similar code ends up close together**.

```python
# These two do the same thing differently → vectors are CLOSE:
def authenticate_user(username, password):        → [0.82, -0.15, 0.44, ...]
    return db.verify_credentials(username, password)

def check_login(user, pw):                        → [0.79, -0.18, 0.41, ...]
    return database.validate(user, pw)

# This does something completely different → vector is FAR:
def calculate_shipping_cost(weight, distance):    → [-0.33, 0.71, -0.09, ...]
    return weight * RATE_PER_KG + distance * RATE_PER_KM
```

When you query "where do we handle authentication?", the query is also converted to a vector, and the system finds the closest code vectors.

## The Architecture: Transformer Encoder

Code embedding models are built on **Transformer encoder** architectures (BERT-family). The pipeline:

```
Input tokens → Transformer encoder layers → Hidden states → Pooling → Embedding vector
```

Each layer applies self-attention (every token "looks at" every other token) and feed-forward networks. Unlike decoder-only models (GPT-style) that process left-to-right, encoders process **bidirectionally** — each token sees the full context. For embeddings, you want the model to understand the complete chunk, not just predict the next token.

### Pooling: How Tokens Become One Vector

After the Transformer processes all tokens, you have one hidden-state vector per token. These must be collapsed into **one vector per chunk**:

| Method | How It Works | Quality for Code |
|--------|-------------|-----------------|
| **Mean-pooling** | Average all token vectors | ✅ Best — captures distributed semantics |
| **CLS token** | Use the special [CLS] token's vector | ❌ Suboptimal — fails to aggregate dispersed info |
| **EOS/last token** | Use the final token's vector | ⚠️ Works for contrastive-trained models |

Research consistently shows **mean-pooling is the most robust default for code**. CLS-token pooling (common in NLP) doesn't work well because code semantics are spread across many tokens — a function's meaning comes from its name, parameters, body, and return type collectively.

## How Cursor Trains Their Model

### The 5-Step Training Pipeline

**Step 1: Collect Agent Session Traces**

When a coding agent works through a task in Cursor, everything is recorded — what queries it made, what files it searched for, what it opened, which code it eventually used. Millions of traces from real developers.

**Step 2: Retrospective Relevance Ranking**

For each trace, an LLM analyzes it:

> "At step 3, the agent was trying to understand authentication. It eventually found the right code at step 7. What code should have been retrieved at step 3 to get there faster?"

The LLM produces relevance rankings — ordered lists of code chunks from most-to-least helpful at each step.

**Step 3: Generate Training Pairs**

From the rankings:

```
(query, positive_code, negative_code_1, negative_code_2, ...)

Example:
- Query: "where do we handle user authentication?"
- Positive (rank 1): auth_middleware.py → verify_token()
- Hard negative (rank 5): user_model.py → User class (related but wrong)
- Easy negative (rank 50): shipping.py → calculate_cost() (unrelated)
```

**Step 4: Contrastive Learning with InfoNCE Loss**

The model is trained to pull positive pairs closer and push negative pairs apart.

**Step 5: Hard Negative Mining**

The critical ingredient — teaching the model to distinguish "almost right" from "actually right."

### The Self-Improving Feedback Loop

```
Better embeddings → Agent finds code faster → Better session traces
       ↑                                              ↓
       └──── LLM ranks traces → Train new model ←────┘
```

This data flywheel means the model improves automatically as more developers use the product.

## The Contrastive Learning Math

### InfoNCE Loss (Step by Step)

Given a batch of N (query, code) pairs. For each query `q_i`, there's one correct code chunk `k_i+` (positive). The other N-1 chunks are negatives.

```
1. Compute similarity scores:
   s_ij = cosine_similarity(embed(q_i), embed(k_j)) / τ
   for all j in {1, ..., N}

2. Apply softmax to get probabilities:
   P(k_i+ | q_i) = exp(s_i,i+) / Σⱼ exp(s_ij)

3. Loss for this pair:
   L_i = -log P(k_i+ | q_i)

4. Total batch loss:
   L = (1/N) Σᵢ L_i
```

In plain English: **maximize the probability that the relevant code chunk is ranked #1 among all candidates in the batch**.

### What Temperature τ Does

Temperature is a scalar (typically 0.05–0.1) that controls sharpness:

- **τ = 0.01** → very sharp: tiny similarity differences matter a lot, model must be very confident
- **τ = 1.0** → very soft: model only needs rough ordering

Lower temperature forces finer-grained distinctions — critical for code where the difference between `find()` and `findOne()` matters enormously.

### Why In-Batch Negatives Work

With batch size 512, each query gets 1 positive and 511 negatives **for free** (other samples in the batch). Larger batches = more negatives = harder task = better model. But in-batch negatives are often "easy" (random code from random repos) — that's where hard negative mining becomes essential.

### Hard Negatives: The Secret Weapon

Most failures in code search come from **near misses**:

```
Query: "How is the stop word table populated?"

✅ Correct:  load_stop_words_from_file(path) → reads file into stop_words dict
❌ Hard neg: load_words_into_table(words)    → loads generic words, not stop words
❌ Hard neg: read_stop_words(stream)         → reads stop words but returns list, doesn't populate table
```

When the model gets a hard negative wrong, the **gradient is large** — it learns a lot. Easy negatives produce small gradients — no learning occurs. This is why hard negatives drive the biggest quality gains.

Cursor mines hard negatives from agent traces — when the agent searched for X but opened the wrong file first, that wrong file is a natural hard negative. GitHub's Copilot team uses LLMs to explicitly generate hard negatives.

## What Makes Code Embedding Hard

| Challenge | Why It's Hard |
|-----------|--------------|
| **Syntax sensitivity** | `if a > b` vs `if a < b` — one character changes meaning |
| **Arbitrary names** | `foo()` and `authenticate_user()` might do the same thing |
| **Multi-language** | Same logic in Python vs Go looks completely different |
| **Comments ≠ code** | Comments describe intent; code implements it |
| **Control flow** | Nesting, branching, loops create complex structures |
| **Context dependency** | A function's meaning depends on what it calls |

Generic text embeddings treat code as text — they know "snowflake" means weather, not a data warehouse. A code-trained model knows "Snowflake" is closer to "Databricks" than to "rain."

## Why Comments Matter Disproportionately

```python
# BAD: No guidance for the embedding model
def proc(x, y):
    return x.verify(y.hash())

# GOOD: Rich semantic signal
def authenticate_user(credentials, stored_hash):
    """Verify user credentials against stored password hash.
    
    Used in the login flow when a user submits username/password.
    Returns True if authentication succeeds.
    """
    return credentials.verify(stored_hash.hash())
```

The second version produces a dramatically better embedding because the function name, docstring, and parameter names all provide semantic signal that matches natural language queries.

## Turbopuffer Internals: How Vector Search Works at Scale

### Why Object Storage?

Cursor has **tens of millions of namespaces** (one per codebase per user). Most are inactive at any time. Traditional vector databases store everything in RAM — at this scale, that's prohibitively expensive.

```
Storage Tier     Cost/GB    Query Latency    
──────────────────────────────────────────
S3 (cold)        $0.02      200-500ms     
NVMe SSD (warm)  $0.60      ~10-50ms      
RAM (hot)        $5.00      <10ms         

Turbopuffer uses all three tiers, auto-promoting hot data.
Traditional vector DBs use RAM only → 250x more expensive.
```

### SPFresh (Clustered Index), Not HNSW

Most vector databases use HNSW (graph-based). Turbopuffer uses **SPFresh** (centroid-based):

**HNSW:** Vectors are nodes in a multi-layer graph. Query navigates hop-by-hop. Each hop = 1 round trip to storage. Many small round trips → bad for S3.

**SPFresh:** Vectors are grouped into semantic clusters. Query process:
1. Fetch all centroids (1 round trip)
2. Find closest centroids
3. Fetch those clusters (1 round trip)

Only 2-4 round trips total. Each S3 round trip ≈ 100ms, so cold queries take ~400ms. Warm queries (cached on NVMe): **~8ms**.

### Namespace-Per-Codebase

```
s3://tpuf/{org_id}/{namespace_id}/
  /wal/     ← write-ahead log (new writes)
  /index/   ← clustered vector index
```

Inactive codebases cost nearly $0 (just S3 storage). Turbopuffer supports `copy_from_namespace` for team index reuse. Scales to tens of millions of namespaces.

## Embedding Dimensions & Matryoshka Learning

The number of dimensions determines how much information a vector can encode:

| Dimensions | Memory per Vector | Typical Use |
|-----------|------------------|-------------|
| 256 | 1 KB | Lightweight, fast |
| 512 | 2 KB | Good balance |
| 1024 | 4 KB | High quality |
| 2048 | 8 KB | Maximum precision |

**Matryoshka Representation Learning** (named after Russian nesting dolls) trains the model so the **first N dimensions are useful on their own**. You can use 256 dims for fast rough search and 2048 for precise retrieval without training separate models.

GitHub Copilot and VoyageCode3 both use this technique. Cursor hasn't disclosed their dimensions but likely uses 1024+.

## How Other Systems Compare

**GitHub Copilot** (Sep 2025): Custom model with contrastive learning + InfoNCE + Matryoshka. Key innovation: LLM-generated hard negatives. Training mix: Python 36.7%, Java 19.0%, C++ 13.8%, JS/TS 8.9%. Results: +37.6% retrieval quality, 2x throughput, 8x smaller index. But uses generic code-docstring pairs, not agent traces.

**VoyageCode3:** 32K token context, 300+ languages, trained on trillions of tokens with tuned code-to-text ratio.

**CodeSage Large V2:** 1.3B params, two-stage training (masked language modeling with identifier deobfuscation, then contrastive learning).

**Nomic Embed Code:** 7B params, fully open-source (weights, training data, eval code), 81.7% accuracy on Python.

**Cursor's unique edge:** None of the above use agent session traces. They all rely on generic code-docstring pairs or synthetic data. Cursor's signal comes from *how developers actually search for and use code during real tasks*.

## Practical Replication Guide

### Minimum Viable System

```
Component         Open-Source Option           Quality vs Cursor
────────────────────────────────────────────────────────────────
Chunking          Chonkie (tree-sitter)        ~90%
Embedding model   Nomic Embed Code (7B)        ~70%
                  or VoyageCode3 (API)         ~75%
Vector storage    FAISS or Qdrant              Works for <100K files
Hybrid search     + ripgrep                    Comparable
Change detection  git diff + file hashing      ~80%
Caching           SQLite by chunk hash         Functional
```

### AST Chunking with Chonkie

```python
from chonkie import CodeChunker

chunker = CodeChunker(language="python", chunk_size=512)
chunks = chunker.chunk(source_code)
for chunk in chunks:
    print(f"Lines {chunk.start_line}-{chunk.end_line}: {chunk.text[:100]}...")
```

### Embed and Search

```python
from sentence_transformers import SentenceTransformer
import faiss, numpy as np

# Embed chunks
model = SentenceTransformer("nomic-ai/nomic-embed-code")
vectors = model.encode([c.text for c in chunks]).astype('float32')
faiss.normalize_L2(vectors)

# Build index
index = faiss.IndexFlatIP(vectors.shape[1])
index.add(vectors)

# Query
q = model.encode(["where do we handle authentication?"]).astype('float32')
faiss.normalize_L2(q)
distances, indices = index.search(q, k=10)
```

### Fine-Tune Your Own (Advanced)

```python
from sentence_transformers import SentenceTransformer, losses, InputExample
from torch.utils.data import DataLoader

# Training pairs: (query, positive_code, hard_negative_code)
train_examples = [
    InputExample(texts=[
        "where do we handle auth?",
        "def verify_token(token): ...",
        "def generate_token(user): ...",  # hard negative
    ])
    for ... in your_data
]

model = SentenceTransformer("nomic-ai/nomic-embed-code")
train_loss = losses.MultipleNegativesRankingLoss(model)  # ≈ InfoNCE

model.fit(
    train_objectives=[(DataLoader(train_examples, batch_size=64), train_loss)],
    epochs=3,
)
```

Without agent traces, generate training data from:
- CodeSearchNet (~6M function-docstring pairs)
- LLMs generating queries for your code
- LLMs ranking search results to find hard negatives
- Your team's actual IDE search patterns

## The Cold Start Problem

Cursor needed an embedding model before having agent traces. The likely bootstrap:

1. Start with a pre-trained code model (CodeBERT/StarCoder)
2. Fine-tune on public datasets (CodeSearchNet)
3. Deploy V1 — good enough for basic semantic search
4. Collect traces — V1 generates session data
5. Train V2 on traces → better retrieval
6. Repeat — each iteration bootstraps the next

Risks: bias amplification (V1's blind spots persist), distribution shift (developer behavior changes as the model improves), and LLM-as-judge errors propagating into training.

## Key Takeaways

1. **The training data is the moat, not the architecture.** Anyone can use contrastive learning. Few have millions of agent session traces.

2. **AST chunking is the single biggest practical improvement** for any code RAG system. Open source via Chonkie/tree-sitter.

3. **Hard negatives drive the biggest quality gains.** The model learns nothing from easy examples.

4. **Comments are engineering decisions, not documentation.** They directly affect embedding quality and retrieval.

5. **Hybrid search (semantic + grep) beats either alone.** Always combine both.

6. **The cold start is solvable.** Start with public datasets, deploy, collect traces, iterate.

## Sources

- [Cursor: Improving agent with semantic search](https://cursor.com/blog/semsearch)
- [Cursor: Securely indexing large codebases](https://cursor.com/blog/secure-codebase-indexing)
- [Turbopuffer: Architecture](https://turbopuffer.com/docs/architecture)
- [TurboPuffer deep dive (Jason Liu)](https://jxnl.co/writing/2025/09/11/turbopuffer-object-storage-first-vector-database-architecture/)
- [GitHub: Inside our new embedding model](https://github.blog/news-insights/product-news/copilot-new-embedding-model-vs-code/)
- [OpenAI: Text and Code Embeddings by Contrastive Pre-Training](https://arxiv.org/abs/2201.10005) (2022)
- [Emergent Mind: Code Embeddings survey](https://www.emergentmind.com/topics/code-embeddings)
- [6 Best Code Embedding Models Compared](https://modal.com/blog/6-best-code-embedding-models-compared)
- [ZenML: Cursor Case Study](https://www.zenml.io/llmops-database/enhancing-ai-coding-agent-performance-with-custom-semantic-search)
- [How Cursor (AI IDE) Works](https://blog.sshh.io/p/how-cursor-ai-ide-works)

---

:::note[Disclaimer]
This article was generated with AI assistance. While the content has been reviewed for accuracy, it is based on publicly available sources and reverse-engineering analyses — not official Cursor documentation. Some details may be approximations or educated inferences. Always refer to [Cursor's official blog](https://cursor.com/blog) and [docs](https://docs.cursor.com) for authoritative information.
:::

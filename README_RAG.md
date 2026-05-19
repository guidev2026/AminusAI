# 🧠 RAG — Retrieval-Augmented Generation (Tutorial Didático)

## O que é RAG?

RAG (Retrieval-Augmented Generation) é uma técnica que permite que um modelo de linguagem (LLM) responda com base em informações que **você forneceu**, sem precisar retreinar ou fine-tunar o modelo.

### Fluxo completo

```
1. Você tem um documento (artigo, tutorial, código)
2. O documento é dividido em chunks (pedaços)
3. Cada chunk vira um embedding (vetor numérico)
4. Você faz uma pergunta → também vira embedding
5. O sistema calcula similaridade cosseno entre sua pergunta e todos os chunks
6. Os chunks mais similares são injetados no prompt como contexto
7. O LLM responde com base nesse contexto
```

---

## Como está implementado no Solus Agent

### 1. Embeddings (`rag.ts:9`)
```typescript
async function gerarEmbedding(texto: string): Promise<number[]> {
  const response = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    body: JSON.stringify({ model: "all-minilm", prompt: texto }),
  });
  const data = await response.json();
  return data.embedding;
}
```

Usa o modelo `all-minilm` do Ollama (45 MB) — leve e rápido. Cada texto vira um array de ~384 números (vetor).

### 2. Similaridade Cosseno (`rag.ts:20`)
```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Fórmula:** cos(θ) = (A · B) / (||A|| × ||B||)

- **A · B** = produto escalar (soma das multiplicações par a par)
- **||A||** = norma (raiz da soma dos quadrados)
- **Resultado:** de -1 (opostos) a +1 (iguais). Valores > 0.5 indicam alta similaridade.

### 3. Chunking (`rag.ts:67`)
```typescript
function chunkText(texto: string, chunkSize: number = 512, overlap: number = 64): string[] {
  const palavras = texto.split(/\s+/);
  for (let start = 0; start < palavras.length; start += chunkSize - overlap) {
    chunks.push(palavras.slice(start, end).join(" "));
  }
  return chunks;
}
```

Divide textos grandes em pedaços de 512 palavras com overlap de 64 — assim contexto relevante não é cortado no meio.

### 4. Augmentation (`rag.ts:117`)
```typescript
export async function augmentarPrompt(userInput: string, systemPromptOriginal: string) {
  const relevantes = await searchRelevant(userInput, 3);
  // Injeta os top-3 chunks no system prompt
}
```

O contexto é injetado **antes** da resposta, não durante. O LLM recebe as instruções + os documentos relevantes + a pergunta.

---

## Para testar na prática

### Adicionar um documento
```
Você: Use add_to_knowledge para armazenar o seguinte conteúdo sobre TypeScript:
"TypeScript é um superset do JavaScript que adiciona tipagem estática opcional..."
```

### Perguntar sobre o documento
```
Você: Quais as principais vantagens do TypeScript?
Agente: [resposta baseada no documento que você armazenou]
```

### Ver estatísticas
```
Você: knowledge_stats
Agente: { "totalChunks": 5, "documentos": { "TypeScript Overview": 5 } }
```

---

## Próximo passo: ChromaDB

Quando quiser migrar para um banco vetorial real, a substituição é direta:

| Atual (didático) | ChromaDB |
|---|---|
| JSON em `data/rag_collection.json` | Banco vetorial persistente |
| Busca linear (compara todos) | Índice HNSW (aproximado, rápido) |
| `cosineSimilarity()` manual | `collection.query(queryEmbeddings, nResults)` |
| `addDocument()` manual | `collection.add(embeddings, metadatas, documents)` |

A lógica de embedding, chunking e augmentation **não muda** — só o backend de armazenamento/busca.
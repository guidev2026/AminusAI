# 🧠 Solus Agent — RAG com ChromaDB (Banco Vetorial)

## O que é RAG?

RAG (Retrieval-Augmented Generation) é uma técnica que combina **recuperação de informação** com **geração de texto**. Em vez de o modelo de IA responder apenas com o que aprendeu durante o treinamento, ele primeiro **busca documentos relevantes** em uma base de conhecimento e depois usa esse contexto para gerar a resposta.

```
Pergunta → busca vetorial → documentos similares → contexto + pergunta → LLM → resposta
```

---

## Por que ChromaDB?

Antes desta versão, o RAG usava **JSON + similaridade cosseno manual**. Agora usamos **ChromaDB**, um banco vetorial open-source real:

| Característica | Antes (JSON) | Agora (ChromaDB) |
|---|---|---|
| Armazenamento | Arquivo JSON | Banco vetorial persistente |
| Busca | Similaridade cosseno manual | Distância L2 / cosseno nativa |
| Embeddings | Ollama all-minilm | ONNX local (ou Ollama opcional) |
| Performance | O(n) linear | HNSW index (log n) |
| Persistência | Salvamento manual | Auto-persistente |

---

## Como o ChromaDB funciona (visão geral)

1. **Embeddings**: Cada chunk de texto é convertido em um vetor numérico (embedding). O ChromaDB pode fazer isso automaticamente via `DefaultEmbeddingFunction` (ONNX, roda localmente sem dependência externa).

2. **Armazenamento**: O vetor + o texto original + metadados são guardados em uma **coleção** (`solus_knowledge`).

3. **Busca**: Quando você pergunta algo, o ChromaDB:
   - Converte sua pergunta em embedding
   - Usa **HNSW (Hierarchical Navigable Small World)** para encontrar os vizinhos mais próximos em alta velocidade
   - Retorna os top-K documentos com suas distâncias

```
Texto: "O Solus Agent usa SQLite"
          ↓
Embedding: [0.023, -0.456, 0.789, ...]  (384 dimensões)
          ↓
ChromaDB guarda em índice HNSW
          ↓
Busca: "Qual banco o Solus usa?"
          ↓
Embedding da pergunta → HNSW → top 3 mais similares
```

---

## Tecnologias usadas

| Componente | Tecnologia | Função |
|---|---|---|
| Banco vetorial | ChromaDB (v3.4+) | Armazenar e buscar embeddings |
| Embedding padrão | ONNX (DefaultEmbeddingFunction) | Gerar embeddings localmente (≈30MB) |
| Embedding alternativo | Ollama all-minilm | Gerar embeddings via API (opcional) |
| Cliente Node.js | `chromadb` (npm) | Conectar ao servidor ChromaDB |
| Servidor ChromaDB | `chroma` (CLI Python/Node) | Rodar o banco na porta 8000 |

---

## Estratégia de Chunking

Documentos são divididos em **chunks** antes de serem armazenados:

```
Documento completo (ex: 1000 palavras)
  ├── Chunk 1 (palavras 1-256)
  ├── Chunk 2 (palavras 225-480)  ← overlap de 32 palavras
  ├── Chunk 3 (palavras 449-704)
  └── Chunk 4 (palavras 673-1000)
```

- **Chunk size**: 256 palavras (modo padrão) ou 64 (modo Ollama)
- **Overlap**: 32 palavras (evita perder contexto nas bordas)
- Cada chunk vira um documento no ChromaDB com metadados: título, fonte, índice

---

## Modos de Embedding

### Modo Default (ONNX) — Recomendado

O ChromaDB embeda automaticamente usando o `DefaultEmbeddingFunction` do pacote `@chroma-core/default-embed`:

```bash
# Adicionar documento
npx tsx src/rag.ts --add manual.txt

# Buscar (feito automaticamente pelo agente quando /rag ativo)
```

**Vantagens**:
- Rápido (roda local em CPU)
- Sem dependência externa
- Sem limite de tamanho de texto

**Desvantagens**:
- Modelo de embedding genérico (all-MiniLM-L6-v2)

### Modo Ollama (all-minilm) — Alternativa

Usa o Ollama para gerar embeddings:

```bash
npx tsx src/rag.ts --add manual.txt --use-ollama
```

**Vantagens**:
- Mesmo modelo do Ollama (consistência)

**Desvantagens**:
- Mais lento (requer chamada HTTP)
- Limitado a textos curtos (< 200 palavras)

---

## Arquitetura do Código

```
src/rag.ts
 ├── Configurações (host, porta, coleção)
 ├── Modos de embedding (default | ollama)
 ├── Cliente ChromaDB (singleton + lazy init)
 ├── Chunking (divisão com overlap)
 ├── API Pública:
 │   ├── addDocument(título, conteúdo, fonte) → number
 │   ├── addDocumentoPorArquivo(caminho) → number
 │   ├── searchRelevant(consulta, topK) → documentos[]
 │   ├── augmentarPrompt(userInput, systemPrompt) → string
 │   ├── getStats() → { totalChunks, documentos }
 │   └── limparColecao() → void
 └── CLI (--add, --add-text, --stats, --list, --clear, --use-ollama)
```

---

## Fluxo Completo (Fim a Fim)

```
1. Usuário ativa RAG: /rag
2. Usuário adiciona documento: /add MeuDoc\nconteúdo...
3. rag.ts divide em chunks e envia ao ChromaDB
4. ChromaDB embeda cada chunk via ONNX e armazena
5. Usuário pergunta algo relacionado
6. agent.ts chama augmentarPrompt()
7. rag.ts busca top-3 chunks similares no ChromaDB
8. Contexto é injetado no system prompt
9. Ollama gera resposta com base no contexto
10. Resposta exibida ao usuário
```

---

## Como rodar o ChromaDB

```bash
# Terminal 1: Servidor ChromaDB
cd solus-agent
chroma run --path ./data/chroma --port 8000

# Terminal 2: Agente
npm run dev
```

> O servidor ChromaDB precisa estar rodando **antes** de usar comandos RAG (`/rag`, `/add`, `/stats`).

---

## Exemplo Didático

Vamos ver o RAG em ação com um documento sobre SOLID:

```javascript
// 1. Adicionar documento
import { addDocument } from "./rag.js";
await addDocument(
  "SOLID Principles",
  "SRP: Uma classe deve ter apenas um motivo para mudar...",
  "manual"
);
// Saída: ✅ 3 chunks adicionados ao ChromaDB

// 2. Buscar contexto
import { searchRelevant } from "./rag.js";
const resultados = await searchRelevant("O que é Single Responsibility?", 2);
// Saída: [ { content: "SRP: Uma classe deve...", title: "SOLID Principles", score: 0.89 }, ... ]

// 3. Augmentar prompt
import { augmentarPrompt } from "./rag.js";
const promptAugmentado = await augmentarPrompt(
  "Explique SRP",
  "Você é um assistente..."
);
// Saída: system prompt original + contexto dos chunks + instrução
```

---

## Comandos Úteis

```bash
# Iniciar ChromaDB (com dados persistentes em data/chroma)
chroma run --path ./data/chroma --port 8000

# Ver heartbeat
curl http://localhost:8000/api/v1/heartbeat

# Listar coleções via API
curl http://localhost:8000/api/v1/collections

# Ver quantos registros na coleção
curl http://localhost:8000/api/v1/collections/solus_knowledge
```

---

## Para Aprender Mais

- [Documentação oficial ChromaDB](https://docs.trychroma.com/)
- [HNSW Algorithm (como ChromaDB busca rápido)](https://arxiv.org/abs/1603.09320)
- [all-MiniLM-L6-v2 (modelo de embedding)](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- [O que são embeddings](https://embeddings.dev/)
- [RAG Paper (Lewis et al., 2020)](https://arxiv.org/abs/2005.11401)
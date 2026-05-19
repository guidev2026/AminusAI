/**
 * Módulo RAG (Retrieval-Augmented Generation)
 *
 * Usa ChromaDB como banco vetorial persistente.
 *
 * Estratégia de Embeddings:
 *   • Padrão: ChromaDB usa DefaultEmbeddingFunction (@chroma-core/default-embed),
 *     que roda localmente via ONNX (rápido, sem dependência externa).
 *   • Alternativa (--use-ollama): Usa all-minilm via Ollama para gerar embeddings.
 *     Nesse caso, os chunks precisam ser pequenos (< 100 palavras) devido a
 *     limitação de contexto do modelo.
 *
 * Funcionamento:
 *   1. Documentos são divididos em chunks
 *   2. Cada chunk é armazenado no ChromaDB (com embedding automático ou customizado)
 *   3. Na busca, a consulta é embedada e o ChromaDB retorna os top-K similares
 */

import { ChromaClient, type Collection } from "chromadb";

// ─── Configurações ──────────────────────────────────────────────────────────

const CHROMA_HOST = "localhost";
const CHROMA_PORT = 8000;
const COLLECTION_NAME = "solus_knowledge";

// ─── Modos de Embedding ─────────────────────────────────────────────────────

type EmbeddingMode = "default" | "ollama";

let embeddingMode: EmbeddingMode = "default";

function setEmbeddingMode(mode: EmbeddingMode) {
  embeddingMode = mode;
}

interface EmbeddingResponse {
  embedding: number[];
}

/**
 * Gera embedding via Ollama (all-minilm).
 * Só funciona com textos curtos (< 256 tokens ≈ 200 palavras).
 */
async function gerarEmbeddingOllama(texto: string): Promise<number[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "all-minilm",
        prompt: texto,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ao gerar embedding no Ollama`);
    }

    const data = (await response.json()) as EmbeddingResponse;
    return data.embedding;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Cliente ChromaDB ───────────────────────────────────────────────────────

let client: ChromaClient;
let collectionPromise: Promise<Collection> | null = null;

function getClient(): ChromaClient {
  if (!client) {
    client = new ChromaClient({ host: CHROMA_HOST, port: CHROMA_PORT });
  }
  return client;
}

async function getCollection(): Promise<Collection> {
  if (!collectionPromise) {
    collectionPromise = (async () => {
      const c = getClient();

      try {
        // Tenta obter coleção existente
        return await c.getCollection({ name: COLLECTION_NAME });
      } catch {
        // Coleção não existe → criar
        return await c.createCollection({
          name: COLLECTION_NAME,
          metadata: { description: "Base de conhecimento Solus Agent" },
        });
      }
    })();
  }
  return collectionPromise;
}

/**
 * Limpa o cache da coleção (útil quando o embedding mode muda).
 */
async function resetCollectionCache(): Promise<void> {
  collectionPromise = null;
}

// ─── Chunking ───────────────────────────────────────────────────────────────

/**
 * Divide um texto em chunks com overlap.
 *
 * No modo Ollama, chunks pequenos (64 palavras) para evitar timeout do all-minilm.
 * No modo default, chunks maiores (256 palavras) pois o ONNX é mais rápido.
 */
function chunkText(texto: string): string[] {
  const chunkSize = embeddingMode === "ollama" ? 64 : 256;
  const overlap = embeddingMode === "ollama" ? 8 : 32;

  const palavras = texto.split(/\s+/);
  const chunks: string[] = [];

  let start = 0;
  while (start < palavras.length) {
    const end = Math.min(start + chunkSize, palavras.length);
    chunks.push(palavras.slice(start, end).join(" "));
    start += chunkSize - overlap;
  }

  return chunks;
}

// ─── API Pública ────────────────────────────────────────────────────────────

/**
 * Adiciona um documento à base de conhecimento.
 *
 * @param title - Título do documento
 * @param content - Conteúdo completo
 * @param source - Origem (manual, file, web, etc.)
 * @returns Número de chunks adicionados
 */
export async function addDocument(
  title: string,
  content: string,
  source: string = "manual",
): Promise<number> {
  const collection = await getCollection();
  const chunks = chunkText(content);
  let adicionados = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const docId = `${title}-${i}-${Date.now()}`;

    if (embeddingMode === "ollama") {
      // Modo Ollama: calculamos o embedding manualmente
      console.log(`  🔄 Gerando embedding (Ollama) do chunk ${i + 1}/${chunks.length}...`);
      const embedding = await gerarEmbeddingOllama(chunk);

      await collection.add({
        ids: [docId],
        embeddings: [embedding],
        metadatas: [{ title, source, chunk_index: i }],
        documents: [chunk],
      });
    } else {
      // Modo default: ChromaDB embeda automaticamente via DefaultEmbeddingFunction
      await collection.add({
        ids: [docId],
        metadatas: [{ title, source, chunk_index: i }],
        documents: [chunk],
      });
    }

    adicionados++;
  }

  console.log(`  ✅ ${adicionados} chunks adicionados ao ChromaDB`);
  return adicionados;
}

/**
 * Adiciona um arquivo de texto à base de conhecimento.
 */
export async function addDocumentoPorArquivo(filePath: string): Promise<number> {
  const { readFileSync } = await import("node:fs");
  const content = readFileSync(filePath, "utf-8");
  const name = filePath.split("/").pop() || filePath;
  return addDocument(name, content, "file");
}

/**
 * Busca documentos relevantes para uma consulta.
 *
 * @param query - Texto da consulta
 * @param topK - Número de resultados
 * @returns Lista de documentos com conteúdo, título e score de similaridade
 */
export async function searchRelevant(
  query: string,
  topK: number = 3,
): Promise<Array<{ content: string; title: string; score: number }>> {
  const collection = await getCollection();
  const count = await collection.count();
  if (count === 0) {
    return [];
  }

  let results;
  if (embeddingMode === "ollama") {
    // Modo Ollama: embedamos a consulta manualmente
    console.log(`  🔍 Gerando embedding da consulta (Ollama)...`);
    const queryEmbedding = await gerarEmbeddingOllama(query);

    results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      include: ["documents", "metadatas", "distances"],
    });
  } else {
    // Modo default: ChromaDB embeda a consulta automaticamente
    results = await collection.query({
      queryTexts: [query],
      nResults: topK,
      include: ["documents", "metadatas", "distances"],
    });
  }

  const documentos = results.documents?.[0] ?? [];
  const metadatas = results.metadatas?.[0] ?? [];
  const distances = results.distances?.[0] ?? [];

  const scores = documentos.map((_doc, i) => {
    const meta = metadatas[i] as Record<string, string> | undefined;
    // ChromaDB retorna distância L2 → converter para score 0-1
    const distance = distances[i] ?? 0;
    const score = Math.max(0, 1 / (1 + distance));

    return {
      content: documentos[i] ?? "",
      title: meta?.title ?? "desconhecido",
      score,
    };
  });

  scores.sort((a, b) => b.score - a.score);

  console.log(
    `  📊 Top scores: ${scores.map((s) => s.score.toFixed(4)).join(", ")}`,
  );

  return scores;
}

/**
 * Aumenta o system prompt com contexto relevante recuperado da base.
 *
 * @param userInput - Mensagem do usuário
 * @param systemPromptOriginal - System prompt original
 * @returns System prompt aumentado com contexto RAG
 */
export async function augmentarPrompt(
  userInput: string,
  systemPromptOriginal: string,
): Promise<string> {
  const relevantes = await searchRelevant(userInput, 3);

  if (relevantes.length === 0) {
    return systemPromptOriginal;
  }

  const contexto = relevantes
    .map(
      (r, i) =>
        `[Fonte ${i + 1}: "${r.title}" (relevância: ${(r.score * 100).toFixed(0)}%)]\n${r.content}`,
    )
    .join("\n\n---\n\n");

  return `${systemPromptOriginal}

Contexto recuperado da base de conhecimento:
---
${contexto}
---

INSTRUÇÃO IMPORTANTE: Use o contexto acima para responder, mas não mencione que está usando "contexto" ou "base de conhecimento" a menos que perguntem explicitamente. Apenas responda naturalmente com base nas informações disponíveis. Se o contexto não tiver informação relevante, ignore-o e responda normalmente.`;
}

/**
 * Estatísticas da base de conhecimento.
 */
export async function getStats(): Promise<{
  totalChunks: number;
  documentos: Record<string, number>;
}> {
  const collection = await getCollection();
  const totalChunks = await collection.count();

  const all = await collection.get({ include: ["metadatas"] });
  const metadatas = all.metadatas as Array<Record<string, string> | null> | undefined;

  const docs: Record<string, number> = {};
  if (metadatas) {
    for (const meta of metadatas) {
      const title = meta?.title ?? "sem-titulo";
      docs[title] = (docs[title] || 0) + 1;
    }
  }

  return { totalChunks, documentos: docs };
}

/**
 * Remove todos os registros da coleção.
 */
export async function limparColecao(): Promise<void> {
  const collection = await getCollection();
  const all = await collection.get({ include: [] });
  const ids = all.ids;
  if (ids.length > 0) {
    // Deletar em lotes de 100 para evitar timeouts
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
      await collection.delete({ ids: ids.slice(i, i + batchSize) });
    }
  }
  console.log(`  🗑️ ${ids.length} registros removidos do ChromaDB`);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function cli() {
  const args = process.argv.slice(2);

  if (args.includes("--use-ollama")) {
    setEmbeddingMode("ollama");
  }

  if (args.includes("--stats")) {
    const stats = await getStats();
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  if (args.includes("--list")) {
    const stats = await getStats();
    console.log("📚 Documentos na base de conhecimento:\n");
    for (const [titulo, chunks] of Object.entries(stats.documentos)) {
      console.log(`  • ${titulo}: ${chunks} chunks`);
    }
    console.log(`\n  Total: ${stats.totalChunks} chunks`);
    return;
  }

  if (args.includes("--clear")) {
    console.log("🗑️ Limpando coleção...");
    await resetCollectionCache();
    await limparColecao();
    console.log("✅ Coleção limpa.");
    return;
  }

  const addIndex = args.indexOf("--add");
  if (addIndex !== -1 && args[addIndex + 1]) {
    const filePath = args[addIndex + 1];
    console.log(`📄 Ingerindo arquivo: ${filePath}`);
    const chunks = await addDocumentoPorArquivo(filePath);
    console.log(`✅ ${chunks} chunks adicionados.`);
    return;
  }

  const addTextIndex = args.indexOf("--add-text");
  if (addTextIndex !== -1 && args[addTextIndex + 2]) {
    const title = args[addTextIndex + 1];
    const content = args[addTextIndex + 2];
    const chunks = await addDocument(title, content);
    console.log(`✅ "${title}" → ${chunks} chunks adicionados.`);
    return;
  }

  // --help ou sem argumentos
  console.log(`
📚 Solus RAG - Ingestão de documentos

Uso:
  npx tsx src/rag.ts --add <caminho_arquivo>          Adiciona um arquivo
  npx tsx src/rag.ts --add-text <titulo> <texto>       Adiciona texto direto
  npx tsx src/rag.ts --stats                           Estatísticas
  npx tsx src/rag.ts --list                            Listar documentos
  npx tsx src/rag.ts --clear                           Limpar base
  npx tsx src/rag.ts --add <arquivo> --use-ollama      Usa Ollama p/ embeddings

Modos:
  default  → ChromaDB embeda automaticamente via ONNX (rápido, sem dep. externa)
  ollama   → Usa all-minilm via Ollama (precisa: ollama pull all-minilm)

Pré-requisitos:
  • ChromaDB rodando: chroma run --path ./data/chroma --port 8000
  • Modo ollama: ollama pull all-minilm
`);
}

// Executa CLI se chamado diretamente
const isMain =
  process.argv[1]?.endsWith("rag.ts") || process.argv[1]?.endsWith("rag.js");
if (isMain) {
  cli().catch(console.error);
}
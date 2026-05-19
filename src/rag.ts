interface EmbeddingResponse {
  embedding: number[];
}

async function gerarEmbedding(texto: string): Promise<number[]> {
  const response = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "all-minilm",
      prompt: texto,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao gerar embedding`);
  }

  const data = (await response.json()) as EmbeddingResponse;
  return data.embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vetores com dimensões diferentes");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

export interface DocumentChunk {
  id: string;
  title: string;
  content: string;
  embedding: number[];
  source: string;
  created_at: string;
}

let collection: DocumentChunk[] = [];

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const COLLECTION_PATH = "./data/rag_collection.json";

function carregarColecao(): void {
  if (existsSync(COLLECTION_PATH)) {
    try {
      const raw = readFileSync(COLLECTION_PATH, "utf-8");
      collection = JSON.parse(raw);
    } catch {
      collection = [];
    }
  } else {
    collection = [];
  }
}

function salvarColecao(): void {
  if (!existsSync("./data")) {
    mkdirSync("./data", { recursive: true });
  }
  writeFileSync(COLLECTION_PATH, JSON.stringify(collection, null, 2), "utf-8");
}

carregarColecao();

function chunkText(texto: string, chunkSize: number = 512, overlap: number = 64): string[] {
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

export async function addDocument(
  title: string,
  content: string,
  source: string = "manual"
): Promise<number> {
  const chunks = chunkText(content);
  let adicionados = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`  🔄 Gerando embedding do chunk ${i + 1}/${chunks.length}...`);
    const embedding = await gerarEmbedding(chunk);

    const doc: DocumentChunk = {
      id: `${title}-${i}-${Date.now()}`,
      title,
      content: chunk,
      embedding,
      source,
      created_at: new Date().toISOString(),
    };

    collection.push(doc);
    adicionados++;
  }

  salvarColecao();
  return adicionados;
}

export async function addDocumentoPorArquivo(filePath: string): Promise<number> {
  const content = readFileSync(filePath, "utf-8");
  const name = filePath.split("/").pop() || filePath;
  return addDocument(name, content, "file");
}

export async function searchRelevant(
  query: string,
  topK: number = 3
): Promise<Array<{ content: string; title: string; score: number }>> {
  if (collection.length === 0) {
    return [];
  }

  console.log(`  🔍 Gerando embedding da consulta...`);
  const queryEmbedding = await gerarEmbedding(query);

  const scored = collection.map((doc) => ({
    content: doc.content,
    title: doc.title,
    score: cosineSimilarity(queryEmbedding, doc.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  console.log(`  📊 Top scores: ${scored.slice(0, topK).map(s => s.score.toFixed(4)).join(", ")}`);

  return scored.slice(0, topK);
}

export async function augmentarPrompt(
  userInput: string,
  systemPromptOriginal: string
): Promise<string> {
  const relevantes = await searchRelevant(userInput, 3);

  if (relevantes.length === 0) {
    return systemPromptOriginal;
  }

  const contexto = relevantes
    .map(
      (r, i) =>
        `[Fonte ${i + 1}: "${r.title}" (relevância: ${(r.score * 100).toFixed(0)}%)]\n${r.content}`
    )
    .join("\n\n---\n\n");

  return `${systemPromptOriginal}

Contexto recuperado da base de conhecimento:
---
${contexto}
---

INSTRUÇÃO IMPORTANTE: Use o contexto acima para responder, mas não mencione que está usando "contexto" ou "base de conhecimento" a menos que perguntem explicitamente. Apenas responda naturalmente com base nas informações disponíveis. Se o contexto não tiver informação relevante, ignore-o e responda normalmente.`;
}

export function getStats(): { totalChunks: number; documentos: Record<string, number> } {
  const docs: Record<string, number> = {};
  for (const doc of collection) {
    docs[doc.title] = (docs[doc.title] || 0) + 1;
  }
  return { totalChunks: collection.length, documentos: docs };
}

export function limparColecao(): void {
  collection = [];
  salvarColecao();
}
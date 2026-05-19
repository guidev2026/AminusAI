import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { Message } from "./agent.js";

const DB_PATH = "./data/solus.db";

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT    NOT NULL,
        role            TEXT    NOT NULL,
        content         TEXT,
        tool_calls      TEXT,
        tool_call_id    TEXT,
        created_at      TEXT    DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_id ON messages(conversation_id);
    `);
  }
  return db;
}

export function novaConversaId(): string {
  return uuidv4();
}

export function salvarMensagem(msg: Message, conversationId: string): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO messages (conversation_id, role, content, tool_calls, tool_call_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    conversationId,
    msg.role,
    msg.content ?? null,
    msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
    msg.tool_call_id ?? null
  );
}

export function carregarConversa(conversationId: string): Message[] {
  const database = getDb();
  const rows = database
    .prepare(
      "SELECT role, content, tool_calls, tool_call_id FROM messages WHERE conversation_id = ? ORDER BY id ASC"
    )
    .all(conversationId) as Array<{
    role: string;
    content: string | null;
    tool_calls: string | null;
    tool_call_id: string | null;
  }>;

  return rows.map((row) => {
    const msg: Message = {
      role: row.role as Message["role"],
      content: row.content,
    };
    if (row.tool_calls) {
      msg.tool_calls = JSON.parse(row.tool_calls);
    }
    if (row.tool_call_id) {
      msg.tool_call_id = row.tool_call_id;
    }
    return msg;
  });
}

export function listarConversas(): Array<{
  id: string;
  preview: string;
  created_at: string;
  total: number;
}> {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT
         conversation_id,
         MIN(created_at) AS created_at,
         COUNT(*)        AS total
       FROM messages
       GROUP BY conversation_id
       ORDER BY created_at DESC`
    )
    .all() as Array<{
    conversation_id: string;
    created_at: string;
    total: number;
  }>;

  return rows.map((row) => {
    const previewRow = database
      .prepare(
        "SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY id ASC LIMIT 1"
      )
      .get(row.conversation_id) as { content: string } | undefined;

    const preview = previewRow
      ? previewRow.content?.substring(0, 80).replace(/\n/g, " ") ?? "(vazia)"
      : "(sem mensagens do usuário)";

    return {
      id: row.conversation_id,
      preview,
      created_at: row.created_at,
      total: row.total,
    };
  });
}

export function deletarConversa(conversationId: string): boolean {
  const database = getDb();
  const result = database
    .prepare("DELETE FROM messages WHERE conversation_id = ?")
    .run(conversationId);
  return result.changes > 0;
}

export function fecharBanco(): void {
  if (db) {
    db.close();
    db = null;
  }
}
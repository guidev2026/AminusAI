# 🤖 Solus Agent — Agente de IA com Memória Persistente e RAG

Agente de IA conversacional em TypeScript que roda localmente via **Ollama**, com **memória persistente em SQLite** e **RAG (Retrieval-Augmented Generation)** usando embeddings.

---

## 📦 Pré-requisitos

- Node.js >= 18
- [Ollama](https://ollama.ai) instalado e rodando com os modelos:

```bash
ollama pull qwen2.5:7b-instruct-q3_K_M   # modelo principal
ollama pull all-minilm                     # modelo de embeddings (45 MB)
ollama serve
```

---

## 🚀 Instalação e execução

```bash
cd solus-agent
npm install
npm run dev
```

### Comandos do chat

| Comando | Descrição |
|---------|-----------|
| `/sair` | Encerra o programa |
| `/reset` | Limpa o histórico da conversa |
| `/history` | Mostra mensagens trocadas |
| `/save` | Mostra o ID da conversa atual |
| `/list` | Lista conversas salvas |
| `/load <id>` | Instruções para carregar outra conversa |
| `/delete <id>` | Apaga uma conversa salva |

### Carregar conversa específica

```bash
npm run dev -- --load <conversation-id>
```

---

## 🧠 RAG — Retrieval-Augmented Generation

O agente pode armazenar documentos em uma base de conhecimento e buscá-los por **similaridade semântica** — ele encontra trechos relevantes mesmo sem correspondência exata de palavras.

### Como funciona

```
Documento → chunking → embeddings → armazenamento
Pergunta → embedding → busca por similaridade cosseno → contexto injetado no prompt
```

### Ferramentas do RAG

| Função | Descrição |
|--------|-----------|
| `search_knowledge_base` | Busca semântica nos documentos armazenados |
| `add_to_knowledge` | Adiciona documento à base (chunka + embeda) |
| `knowledge_stats` | Estatísticas da coleção |

### Exemplo de uso

```
Você: Pode adicionar um documento sobre SOLID principles?
Agente: Claro! Me passe o conteúdo.

Você: [cola o texto sobre SOLID]
Agente: ✅ Documento "SOLID Principles" adicionado (8 chunks indexados).

Você: O que é o Princípio da Responsabilidade Única?
Agente: [resposta baseada no documento armazenado - RAG em ação!]
```

> ⚙️ A implementação do RAG é **didática**: a similaridade cosseno é calculada manualmente, o chunking é explícito e a persistência usa JSON. Perfeito para aprender como bancos vetoriais funcionam antes de migrar para ChromaDB.

Veja detalhes em [`README_RAG.md`](./README_RAG.md).

---

## 🗄️ Memória Persistente (SQLite)

- Banco: `data/solus.db` com `better-sqlite3` (nativo, sem ORM)
- WAL mode para performance em leitura/escrita concorrente
- Cada conversa é identificada por UUID
- Tabela `messages` armazena role, content, tool_calls e timestamps

---

## 🛠️ Function Calling

O agente pode executar funções reais para responder com precisão:

| Função | Descrição |
|--------|-----------|
| `get_current_time` | Data e hora atual (Brasília) |
| `calculate` | Avalia expressões matemáticas |
| `get_word_count` | Conta palavras e caracteres |
| `convert_currency` | Converte entre BRL, USD, EUR, ARS |
| `search_knowledge_base` | Busca semântica na base de conhecimento |
| `add_to_knowledge` | Adiciona documento à base |
| `knowledge_stats` | Estatísticas da base |

Veja [`README_FUNCTION_CALLING.md`](./README_FUNCTION_CALLING.md) para detalhes.

---

## 📁 Estrutura do projeto

```
solus-agent/
├── src/
│   ├── agent.ts      → Motor do agente (histórico, Ollama, function calling)
│   ├── memory.ts     → Persistência SQLite (conversas)
│   ├── rag.ts        → RAG (embeddings + busca vetorial + augmentation)
│   ├── tools.ts      → Definição e handlers das ferramentas
│   └── index.ts      → Terminal interativo (CLI)
├── data/
│   ├── solus.db          → Banco SQLite (conversas)
│   └── rag_collection.json → Coleção vetorial (chunks + embeddings)
├── README.md              → Este arquivo
├── README_FUNCTION_CALLING.md → Tutorial de function calling
├── README_RAG.md          → Tutorial detalhado do RAG
├── package.json
└── tsconfig.json
```

---

## 🔄 Como o agente funciona

```
        ┌─────────────────────────────────────────┐
        │              Loop do Chat                │
        │                                          │
        │  Você digita → agent.process(input)      │
        │                      ↓                   │
        │         Salva no SQLite (memória)         │
        │                      ↓                   │
        │   Se RAG ativo: busca contexto similar    │
        │                      ↓                   │
        │      Monta mensagens + tools (JSON)       │
        │                      ↓                   │
        │        Envia pro Ollama (HTTP POST)       │
        │                      ↓                   │
        │   Se modelo chamou tool → executa → loop  │
        │                      ↓                   │
        │       Salva resposta no SQLite            │
        │                      ↓                   │
        │         Mostra resposta na tela           │
        │                      ↓                   │
        │            (volta ao início)              │
        └─────────────────────────────────────────┘
```

---

## 📚 Próximos passos

- Migrar o RAG JSON para **ChromaDB** (banco vetorial real)
- Adicionar **streaming** (resposta palavra por palavra)
- Criar interface web
- Suporte a múltiplos documentos (PDF, Markdown, texto)
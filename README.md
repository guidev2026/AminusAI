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

## 🧠 RAG — Retrieval-Augmented Generation com ChromaDB

O agente usa **ChromaDB** (banco vetorial open-source) para armazenar documentos e buscá-los por **similaridade semântica**. Ele encontra trechos relevantes mesmo sem correspondência exata de palavras.

### Pré-requisitos do RAG

Instale o ChromaDB **fora do projeto** (CLI global):

```bash
pip install chromadb
# ou: npm install -g chromadb
```

Depois inicie o servidor:

```bash
chroma run --path ./data/chroma --port 8000
```

### Como funciona

```
Documento → chunking (256 palavras) → embedding (ONNX local) → ChromaDB
Pergunta  → embedding automático → busca por distância L2 → contexto injetado no prompt
```

### Comandos no chat

| Comando | Descrição |
|---------|-----------|
| `/rag` | Ativa/desativa o RAG |
| `/add Título\nconteúdo` | Adiciona documento à base |
| `/stats` | Estatísticas da base de conhecimento |

### Exemplo de uso

```
Você: /rag
✅ RAG ativado!

Você: /add SOLID Principles
O Princípio da Responsabilidade Única diz que uma classe deve ter...
✅ Documento adicionado (3 chunks).

Você: O que é SRP?
Agente: [resposta baseada no documento armazenado - RAG em ação!]
```

### CLI de ingestão

```bash
# Adicionar arquivo
npx tsx src/rag.ts --add arquivo.txt

# Adicionar com Ollama (alternativa)
npx tsx src/rag.ts --add arquivo.txt --use-ollama

# Estatísticas
npx tsx src/rag.ts --stats

# Listar documentos
npx tsx src/rag.ts --list

# Limpar base
npx tsx src/rag.ts --clear
```

Veja detalhes técnicos e explicação didática em [`README_RAG.md`](./README_RAG.md).

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
│   └── chroma/           → Dados persistentes do ChromaDB
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

- Adicionar **streaming** (resposta palavra por palavra)
- Criar interface web
- Suporte a múltiplos documentos (PDF, Markdown, texto)

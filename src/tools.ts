function getCurrentTimeHandler(_args: Record<string, unknown>): string {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
    timeStyle: "long",
  });
}

function calculateHandler(args: Record<string, unknown>): string {
  const expression = String(args.expression ?? "").trim();
  if (!expression) return "Nenhuma expressão fornecida.";

  const allowed = /^[\d+\-*/().%\s]+$/;
  if (!allowed.test(expression)) {
    return "Expressão inválida. Use apenas números e operadores (+, -, *, /, %, ()).";
  }

  try {
    const result = eval(expression);
    return `${expression} = ${result}`;
  } catch {
    return `Erro ao calcular "${expression}". Verifique a sintaxe.`;
  }
}

function getWordCountHandler(args: Record<string, unknown>): string {
  const text = String(args.text ?? "");
  if (!text) return "Nenhum texto fornecido.";

  const palavras = text.trim().split(/\s+/).length;
  const caracteres = text.length;
  const caracteresSemEspaco = text.replace(/\s/g, "").length;

  return JSON.stringify({ palavras, caracteres, caracteresSemEspaco });
}

const TAXAS_CAMBIO: Record<string, number> = {
  BRL: 1,
  USD: 0.19,
  EUR: 0.17,
  ARS: 172,
};

function convertCurrencyHandler(args: Record<string, unknown>): string {
  const valor = Number(args.valor) || 0;
  const de = String(args.de).toUpperCase().trim();
  const para = String(args.para).toUpperCase().trim();

  if (valor <= 0) return "Valor deve ser maior que zero.";
  if (!TAXAS_CAMBIO[de]) return `Moeda de origem "${de}" não suportada. Use: BRL, USD, EUR, ARS.`;
  if (!TAXAS_CAMBIO[para]) return `Moeda de destino "${para}" não suportada. Use: BRL, USD, EUR, ARS.`;

  const valorEmBRL = de === "BRL" ? valor : valor / TAXAS_CAMBIO[de];
  const convertido = valorEmBRL * TAXAS_CAMBIO[para];

  return `${valor.toFixed(2)} ${de} = ${convertido.toFixed(2)} ${para}`;
}

async function searchKnowledgeBaseHandler(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query ?? "").trim();
  const topK = Number(args.top_k) || 3;

  if (!query) return "Nenhuma consulta fornecida.";

  try {
    const { searchRelevant } = await import("./rag.js");
    const resultados = await searchRelevant(query, topK);

    if (resultados.length === 0) {
      return "Nenhum resultado encontrado na base de conhecimento.";
    }

    return JSON.stringify(
      resultados.map((r) => ({
        fonte: r.title,
        relevancia: `${(r.score * 100).toFixed(0)}%`,
        conteudo: r.content.substring(0, 300) + (r.content.length > 300 ? "..." : ""),
      })),
      null,
      2
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Erro ao buscar na base de conhecimento: ${msg}. Certifique-se de que o modelo all-minilm está baixado (ollama pull all-minilm).`;
  }
}

async function addToKnowledgeHandler(args: Record<string, unknown>): Promise<string> {
  const title = String(args.title ?? "").trim();
  const content = String(args.content ?? "").trim();

  if (!title) return "Título não fornecido.";
  if (!content) return "Conteúdo não fornecido.";

  try {
    const { addDocument } = await import("./rag.js");
    const chunks = await addDocument(title, content);
    return `✅ Documento "${title}" adicionado à base de conhecimento (${chunks} chunks indexados).`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Erro ao adicionar documento: ${msg}. Certifique-se de que o modelo all-minilm está baixado (ollama pull all-minilm).`;
  }
}

async function knowledgeStatsHandler(_args: Record<string, unknown>): Promise<string> {
  const { getStats } = await import("./rag.js");
  const stats = getStats();
  return JSON.stringify(stats, null, 2);
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolHandler {
  (args: Record<string, unknown>): string | Promise<string>;
}

const handlers: Record<string, ToolHandler> = {
  get_current_time: getCurrentTimeHandler,
  calculate: calculateHandler,
  get_word_count: getWordCountHandler,
  convert_currency: convertCurrencyHandler,
  search_knowledge_base: searchKnowledgeBaseHandler,
  add_to_knowledge: addToKnowledgeHandler,
  knowledge_stats: knowledgeStatsHandler,
};

export function criarFerramentas(): ToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "get_current_time",
        description: "Obtém a data e hora atuais no horário de Brasília (America/Sao_Paulo).",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "calculate",
        description: "Avalia uma expressão matemática simples (+, -, *, /, %, parênteses).",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "Expressão matemática para calcular. Ex: '(15 + 3) * 2'",
            },
          },
          required: ["expression"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_word_count",
        description: "Conta o número de palavras e caracteres em um texto.",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Texto a ser analisado.",
            },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "convert_currency",
        description:
          "Converte um valor entre moedas. Taxas fixas (didáticas): BRL, USD, EUR, ARS.",
        parameters: {
          type: "object",
          properties: {
            valor: {
              type: "number",
              description: "Valor a ser convertido.",
            },
            de: {
              type: "string",
              description: "Moeda de origem (BRL, USD, EUR ou ARS).",
            },
            para: {
              type: "string",
              description: "Moeda de destino (BRL, USD, EUR ou ARS).",
            },
          },
          required: ["valor", "de", "para"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_knowledge_base",
        description:
          "Busca documentos na base de conhecimento usando similaridade semântica (embeddings). Ideal para perguntas que exigem conhecimento específico que foi armazenado.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "A pergunta ou termo de busca em linguagem natural.",
            },
            top_k: {
              type: "number",
              description: "Quantos resultados retornar (padrão 3, máximo 10).",
            },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "add_to_knowledge",
        description:
          "Adiciona um documento à base de conhecimento do agente. O texto será chunkado, embedado e indexado para buscas futuras via RAG.",
        parameters: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Título descritivo do documento.",
            },
            content: {
              type: "string",
              description: "Conteúdo completo do documento a ser indexado.",
            },
          },
          required: ["title", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "knowledge_stats",
        description:
          "Retorna estatísticas da base de conhecimento: total de chunks e documentos indexados.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
  ];
}

export async function processarChamadaDeFuncao(
  name: string,
  args: string
): Promise<string> {
  const handler = handlers[name];
  if (!handler) {
    return `Função "${name}" não encontrada.`;
  }

  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = JSON.parse(args);
  } catch {
    return `Erro ao interpretar argumentos da função "${name}": JSON inválido.`;
  }

  try {
    return await handler(parsedArgs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Erro ao executar "${name}": ${msg}`;
  }
}
/**
 * Definição das ferramentas (tools) para function calling.
 *
 * Cada ferramenta tem:
 *  - Definição no formato OpenAI/Ollama (name, description, parameters)
 *  - Função handler que executa a lógica real
 */

// ---------------------------------------------------------------------------
// 1. get_current_time — retorna data e hora atual
// ---------------------------------------------------------------------------
function getCurrentTimeHandler(_args: Record<string, unknown>): string {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
    timeStyle: "long",
  });
}

// ---------------------------------------------------------------------------
// 2. calculate — avalia expressão matemática simples
// ---------------------------------------------------------------------------
function calculateHandler(args: Record<string, unknown>): string {
  const expression = String(args.expression ?? "").trim();
  if (!expression) return "Nenhuma expressão fornecida.";

  // Validação de segurança: só permite números, operadores, parênteses, espaços e ponto
  const allowed = /^[\d+\-*/().%\s]+$/;
  if (!allowed.test(expression)) {
    return "Expressão inválida. Use apenas números e operadores (+, -, *, /, %, ()).";
  }

  try {
    // eslint-disable-next-line no-eval
    const result = eval(expression);
    return `${expression} = ${result}`;
  } catch {
    return `Erro ao calcular "${expression}". Verifique a sintaxe.`;
  }
}

// ---------------------------------------------------------------------------
// 3. get_word_count — conta palavras e caracteres de um texto
// ---------------------------------------------------------------------------
function getWordCountHandler(args: Record<string, unknown>): string {
  const text = String(args.text ?? "");
  if (!text) return "Nenhum texto fornecido.";

  const palavras = text.trim().split(/\s+/).length;
  const caracteres = text.length;
  const caracteresSemEspaco = text.replace(/\s/g, "").length;

  return JSON.stringify({ palavras, caracteres, caracteresSemEspaco });
}

// ---------------------------------------------------------------------------
// 4. convert_currency — conversão simples entre moedas (taxas fixas)
// ---------------------------------------------------------------------------
const TAXAS_CAMBIO: Record<string, number> = {
  BRL: 1,
  USD: 0.19,  // 1 BRL ≈ 0.19 USD  (exemplo didático)
  EUR: 0.17,  // 1 BRL ≈ 0.17 EUR
  ARS: 172,   // 1 BRL ≈ 172 ARS
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

// ---------------------------------------------------------------------------
// Catálogo de ferramentas
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolHandler {
  (args: Record<string, unknown>): string;
}

// Mapa nome → handler
const handlers: Record<string, ToolHandler> = {
  get_current_time: getCurrentTimeHandler,
  calculate: calculateHandler,
  get_word_count: getWordCountHandler,
  convert_currency: convertCurrencyHandler,
};

// Lista de definições (enviada para o modelo)
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
  ];
}

/**
 * Processa uma chamada de função vinda do modelo.
 * @param name  Nome da função
 * @param args  Argumentos em JSON string
 */
export function processarChamadaDeFuncao(
  name: string,
  args: string
): string {
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
    return handler(parsedArgs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Erro ao executar "${name}": ${msg}`;
  }
}
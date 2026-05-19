# 🛠️ Function Calling — Solus Agent

Este documento explica as alterações feitas no Solus Agent para adicionar **function calling**: a capacidade do modelo de IA de chamar funções reais do sistema durante a conversa.

---

## 📦 O que mudou na estrutura do projeto

```
solus-agent/
├── package.json          → (inalterado)
├── src/
│   ├── agent.ts          → MODIFICADO: agora gerencia tool_calls
│   ├── index.ts          → (inalterado)
│   └── tools.ts          → NOVO: definição e execução das ferramentas
├── README.md             → (inalterado, exceto seção nova)
└── README_FUNCTION_CALLING.md  → NOVO: este arquivo
```

Apenas **1 arquivo novo** e **1 arquivo modificado**. O `index.ts` permanece idêntico — o function calling é transparente para quem usa o terminal.

---

## 🧰 As 4 ferramentas disponíveis

### 1. `get_current_time` — Data e hora atual

- **Parâmetros:** nenhum
- **Retorno:** data e hora no fuso de Brasília (America/Sao_Paulo)
- **Exemplo de uso no chat:**
  ```
  Que horas são?
  ```

### 2. `calculate` — Calculadora matemática

- **Parâmetros:**
  - `expression` (string) — expressão a ser avaliada. Ex: `"(15 + 3) * 2"`
- **Segurança:** aceita apenas números e operadores (`+`, `-`, `*`, `/`, `%`, `(`, `)`)
- **Exemplo de uso no chat:**
  ```
  Quanto é 45 * 12 + 8?
  ```

### 3. `get_word_count` — Contador de palavras

- **Parâmetros:**
  - `text` (string) — texto a ser analisado
- **Retorno (JSON):**
  ```json
  { "palavras": 5, "caracteres": 28, "caracteresSemEspaco": 23 }
  ```
- **Exemplo de uso no chat:**
  ```
  Quantas palavras tem "Olá, mundo! Testando o contador"?
  ```

### 4. `convert_currency` — Conversor de moedas

- **Parâmetros:**
  - `valor` (number) — valor a converter
  - `de` (string) — moeda de origem (`BRL`, `USD`, `EUR`, `ARS`)
  - `para` (string) — moeda de destino
- **Taxas (fixas, para demonstração):**
  | Moeda | 1 BRL = |
  |-------|---------|
  | USD   | 0.19    |
  | EUR   | 0.17    |
  | ARS   | 172     |
- **Exemplo de uso no chat:**
  ```
  Converta 50 reais para dólar
  ```

---

## 🔄 Como o function calling funciona

### Fluxo completo

```
Usuário: "Quantas palavras tem 'um dois três'?"
    │
    ▼
┌─ agent.process("Quantas palavras tem 'um dois três'?") ──────────────────┐
│                                                                          │
│  1. Adiciona a mensagem do usuário ao histórico                          │
│  2. Chama callOllama() com messages + tools                              │
│     └─ POST /api/chat  { model, messages, tools }                       │
│                                                                          │
│  3. O modelo analisa e decide: "isso é uma tarefa para get_word_count"   │
│     └─ Resposta: { tool_calls: [{ function: { name, arguments } }] }    │
│                                                                          │
│  4. Loop detecta tool_calls → executa cada uma                           │
│     └─ processarChamadaDeFuncao("get_word_count", '{"text":"..."}')     │
│     └─ Resultado: '{"palavras":3,"caracteres":13}'                      │
│                                                                          │
│  5. Adiciona resultado no histórico como role:"tool"                     │
│  6. Chama callOllama() NOVAMENTE com o resultado da tool                 │
│     └─ Agora o modelo vê o resultado e formula a resposta               │
│                                                                          │
│  7. Resposta final (sem tool_calls): "O texto tem 3 palavras."           │
│  8. Adiciona resposta ao histórico e retorna                             │
└──────────────────────────────────────────────────────────────────────────┘
    │
    ▼
Usuário vê: "O texto 'um dois três' tem 3 palavras e 13 caracteres."
```

### Segurança: limite de iterações

O loop de function calling tem no máximo **5 iterações** para evitar loops infinitos. Se o modelo ficar chamando ferramentas sem parar, o loop é interrompido e a última resposta disponível é retornada.

---

## 📝 O que mudou em `agent.ts`

### Interface `Message` expandida

```typescript
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}
```

- **`role: "tool"`** — novo tipo de mensagem para resultados de funções
- **`tool_calls`** — array de chamadas de função que o modelo decidiu fazer
- **`tool_call_id`** — identificador da chamada (usamos o nome da função)

### Método `callOllama()` modificado

Agora aceita um parâmetro opcional `tools`:
- Se houver ferramentas definidas, inclui `"tools": [...]` no corpo da requisição
- Retorna o objeto `Message` completo (não apenas o texto)

### Método `process()` com loop de function calling

```typescript
async process(userInput: string): Promise<string> {
  this.messages.push({ role: "user", content: userInput });

  const tools = criarFerramentas();
  let resposta = await this.callOllama(this.messages, tools);

  let iteracoes = 0;
  const MAX_ITERACOES = 5;

  while (resposta.tool_calls && resposta.tool_calls.length > 0 && iteracoes < MAX_ITERACOES) {
    // Adiciona resposta do assistente com tool_calls ao histórico
    this.messages.push({ role: "assistant", content: resposta.content, tool_calls: resposta.tool_calls });

    // Executa cada tool_call
    for (const tc of resposta.tool_calls) {
      const resultado = processarChamadaDeFuncao(tc.function.name, tc.function.arguments);
      this.messages.push({ role: "tool", content: resultado, tool_call_id: tc.function.name });
    }

    // Chama o modelo novamente
    resposta = await this.callOllama(this.messages, tools);
    iteracoes++;
  }

  const textoFinal = resposta.content || "(sem resposta)";
  this.messages.push({ role: "assistant", content: textoFinal });
  return textoFinal;
}
```

---

## 🧪 Como testar

Com o agente rodando (`npm run dev`), experimente estes prompts:

```
Que horas são?
```
→ O modelo chama `get_current_time`

```
Quanto é 128 * 7?
```
→ O modelo chama `calculate`

```
Quantas palavras tem essa frase: "Function calling é muito útil"?
```
→ O modelo chama `get_word_count`

```
Converta 100 reais para dólar
```
→ O modelo chama `convert_currency`

---

## ➕ Como adicionar uma nova ferramenta

1. **Crie o handler** em `src/tools.ts`:

```typescript
function meuNomeHandler(args: Record<string, unknown>): string {
  const param = String(args.param ?? "");
  return `Resultado: ${param}`;
}
```

2. **Registre no mapa `handlers`** (no mesmo arquivo):

```typescript
const handlers: Record<string, ToolHandler> = {
  // ... já existentes ...
  minha_nova_funcao: meuNomeHandler,
};
```

3. **Adicione a definição** em `criarFerramentas()`:

```typescript
{
  type: "function",
  function: {
    name: "minha_nova_funcao",
    description: "Descrição clara do que a função faz.",
    parameters: {
      type: "object",
      properties: {
        param: {
          type: "string",
          description: "Descrição do parâmetro.",
        },
      },
      required: ["param"],
    },
  },
}
```

Pronto. Na próxima execução o modelo já poderá usar sua nova ferramenta.

---

## ⚠️ Limitações conhecidas

- **Depende do modelo suportar tools:** modelos mais antigos ou muito pequenos podem ignorar as ferramentas. `qwen2.5:7b` e superiores funcionam bem.
- **Taxas de câmbio fixas:** o `convert_currency` usa taxas estáticas de exemplo. Para taxas reais, seria necessário integrar uma API externa.
- **Sem streaming com tools:** o function calling não usa streaming (`stream: false`) para simplificar o loop. A resposta final (após as tools) é exibida normalmente.

---

## 🔗 Referências

- [Ollama API — chat with tools](https://github.com/ollama/ollama/blob/main/docs/api.md#request-9)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
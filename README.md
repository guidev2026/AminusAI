# 🤖 Solus Agent

Um agente de IA minimalista em TypeScript que conversa com você pelo terminal usando o modelo **qwen2.5:3b** rodando localmente via [Ollama](https://ollama.ai).

## Pré-requisitos

- Node.js >= 18
- Ollama instalado e rodando com o modelo baixado:

```bash
ollama pull qwen2.5:3b-instruct-q3_K_M
ollama serve
```

## Instalação e execução

```bash
cd solus-agent
npm install
npm run dev
```

Comandos durante a conversa:
- **`/sair`** — encerra o programa
- **`/reset`** — limpa o histórico da conversa
- **`/history`** — mostra as mensagens trocadas até agora

---

## Como o código funciona (explicado parte por parte)

O projeto tem **apenas 2 arquivos**:

```
solus-agent/
├── package.json      → configuração do projeto
├── src/
│   ├── agent.ts      → o motor do agente (84 linhas)
│   └── index.ts      → o terminal interativo (78 linhas)
└── README.md         → este arquivo
```

---

### 1. `agent.ts` — O motor

```typescript
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}
```

**O que é:** Uma `interface` define a estrutura de uma mensagem. Toda conversa é uma lista dessas mensagens.

**Analogia Java:** É como um `record`:
```java
public record Message(String role, String content) {}
```

**Cada `role` significa:**
- `"system"` → instrução fixa que diz ao modelo como se comportar (a "personalidade")
- `"user"` → o que você digita
- `"assistant"` → o que o modelo responde

---

```typescript
export class Agent {
  private readonly model: string;
  private readonly messages: Message[];
```

**O que é:** A classe `Agent` é o cérebro do programa. Ela guarda:

- `model` → qual modelo do Ollama usar (ex: `qwen2.5:3b-instruct-q3_K_M`)
- `messages` → o histórico da conversa (a "memória" do agente)

**Analogia Java:** Mesma coisa:
```java
public class Agent {
    private final String model;
    private final List<Message> messages;
}
```

---

```typescript
  constructor(
    model: string,
    systemPrompt: string = "Você é um assistente amigável e prestativo."
  ) {
    this.model = model;
    this.messages = [{ role: "system", content: systemPrompt }];
  }
```

**O que faz:** Quando você cria um `new Agent(...)`, ele:
1. Guarda o nome do modelo
2. Cria o histórico com uma **mensagem de sistema** — isso define como o modelo vai se comportar

**Por que isso importa:** É aqui que você define a personalidade do seu agente. Troque o `systemPrompt` e você muda completamente o comportamento.

---

```typescript
  private async callOllama(): Promise<string> {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages: this.messages, stream: false }),
    });
```

**O que faz:** manda o histórico inteiro para o Ollama via HTTP.

**A mágica:** O Ollama expõe uma API REST simples. Um POST com JSON para `http://localhost:11434/api/chat` e pronto — o modelo "pensa" e responde.

**stream: false** significa "espera a resposta completa". O modelo devolve tudo de uma vez.

---

```typescript
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { message: Message; done: boolean };
    return data.message.content;
```

**O que faz:** Pega o JSON de resposta e extrai só o texto que o modelo gerou.

**A resposta do Ollama vem assim:**
```json
{
  "message": { "role": "assistant", "content": "Olá! Como posso ajudar?" },
  "done": true
}
```

---

```typescript
  async process(userInput: string): Promise<string> {
    this.messages.push({ role: "user", content: userInput });
    try {
      const resposta = await this.callOllama();
      this.messages.push({ role: "assistant", content: resposta });
      return resposta;
    } catch (error) {
      this.messages.pop();
      throw error;
    }
  }
```

**Esta é a função mais importante.** O **ciclo de vida** de cada mensagem:

| Passo | Ação | Resultado em `messages[]` |
|-------|------|--------------------------|
| 1 | Adiciona o que você digitou | `[system, user]` |
| 2 | Chama o Ollama (HTTP) | (espera) |
| 3 | Adiciona a resposta do modelo | `[system, user, assistant]` |
| 4 | Devolve a resposta | — |
| Se der erro | Remove o que você digitou | Volta ao estado anterior |

**É exatamente isso que faz o agente ter "memória":** como ele sempre manda o histórico completo, o modelo "lembra" do que foi falado antes.

---

```typescript
  getHistory(): Message[] { return [...this.messages]; }
  reset(): void {
    const systemPrompt = this.messages[0];
    this.messages.length = 0;
    this.messages.push(systemPrompt);
  }
```

- `getHistory()` → retorna uma **cópia** do histórico (útil pra debug)
- `reset()` → limpa tudo, mas mantém a personalidade (o system prompt)

---

### 2. `index.ts` — O terminal

```typescript
import { Agent } from "./agent.js";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
```

- `Agent` → nossa classe do outro arquivo
- `readline` → equivalente ao `Scanner(System.in)` do Java

---

```typescript
const rl = readline.createInterface({ input, output });
const MODEL = "qwen2.5:3b-instruct-q3_K_M";
const agent = new Agent(MODEL, SYSTEM_PROMPT);
```

Cria o agente com o modelo que você escolheu e a personalidade definida.

---

```typescript
async function chatLoop(): Promise<void> {
  const input = await rl.question("\nVocê: ");
  const normalized = input.trim().toLowerCase();
```

**O loop do agente:** Pergunta, espera a digitação, normaliza (tira espaços, minúsculo).

---

```typescript
  if (normalized === "/sair" || normalized === "/exit" || normalized === "/quit") {
    console.log("\nAté mais! 👋");
    rl.close();
    return;
  }
```

Comandos especiais são tratados antes de chamar o modelo.

---

```typescript
  try {
    console.log("\n🤖 Agente: ");
    const resposta = await agent.process(input);
    console.log(resposta);
  } catch (error) {
    console.error("\n❌ Erro:", error);
  }
```

**O coração do programa:** `agent.process(input)` faz tudo:
- adiciona no histórico
- chama o Ollama
- adiciona a resposta no histórico
- devolve o texto

E no final, `chatLoop()` chama ela mesma de novo — criando um loop infinito até o usuário digitar `/sair`.

---

## Function Calling

O Solus Agent agora suporta **function calling** — o modelo pode decidir chamar funções reais do sistema para responder com precisão.

Quatro ferramentas estão disponíveis:

| Função | Descrição |
|--------|-----------|
| `get_current_time` | Retorna data e hora atual |
| `calculate` | Avalia expressões matemáticas |
| `get_word_count` | Conta palavras e caracteres |
| `convert_currency` | Converte entre moedas (BRL, USD, EUR, ARS) |

Veja o arquivo [`README_FUNCTION_CALLING.md`](./README_FUNCTION_CALLING.md) para detalhes completos.

---

## Resumo: o que é um "agente"?

```
       ┌─────────────────────────────────────┐
       │            Loop Infinito             │
       │                                     │
       │  Você digita → agent.process(input) │
       │                      ↓              │
       │           Adiciona no histórico      │
       │                      ↓              │
       │      Manda histórico pro Ollama      │
       │                      ↓              │
       │        Modelo "pensa" e responde     │
       │                      ↓              │
       │     Adiciona resposta no histórico   │
       │                      ↓              │
       │         Mostra resposta na tela      │
       │                      ↓              │
       │            (volta ao início)         │
       └─────────────────────────────────────┘
```

É **só isso**. Não tem mágica. Um agente é:

1. **Um histórico** (array de mensagens)
2. **Uma conexão com um modelo** (HTTP pro Ollama)
3. **Um loop** que repete: input → chama modelo → salva resposta → mostra

O resto (ferramentas, memória persistente, streaming) são incrementos em cima dessa base.

---

## Próximos passos

Depois que esse loop fizer sentido, você pode evoluir para:

- **Function calling**: o agente decide quando chamar funções (ex: `getWeather()`, `calcular()`)
- **Memória persistente**: salvar o histórico em um arquivo
- **Streaming**: mostrar a resposta palavra por palavra (mais rápido)
- **Interface web**: trocar o terminal por uma página HTML

Mas o motor é sempre o mesmo que você acabou de construir. 🚀
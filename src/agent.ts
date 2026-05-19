import { criarFerramentas, processarChamadaDeFuncao } from "./tools.js";

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export class Agent {
  private readonly model: string;
  private readonly messages: Message[];

  constructor(
    model: string,
    systemPrompt: string = "Você é um assistente amigável e prestativo."
  ) {
    this.model = model;
    this.messages = [{ role: "system", content: systemPrompt }];
  }

  /**
   * Envia mensagens + tools para o Ollama e retorna a resposta completa.
   */
  private async callOllama(
    messages: Message[],
    tools?: unknown[]
  ): Promise<Message> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as {
      message: Message;
      done: boolean;
    };
    return data.message;
  }

  async process(userInput: string): Promise<string> {
    this.messages.push({ role: "user", content: userInput });

    try {
      const tools = criarFerramentas();
      let resposta = await this.callOllama(this.messages, tools);

      // Loop de function calling — no máximo 5 iterações por segurança
      let iteracoes = 0;
      const MAX_ITERACOES = 5;

      while (
        resposta.tool_calls &&
        resposta.tool_calls.length > 0 &&
        iteracoes < MAX_ITERACOES
      ) {
        // Adiciona a resposta do assistente (com os tool_calls) ao histórico
        this.messages.push({
          role: "assistant",
          content: resposta.content,
          tool_calls: resposta.tool_calls,
        });

        // Executa cada tool_call e adiciona os resultados
        for (const tc of resposta.tool_calls) {
          const resultado = processarChamadaDeFuncao(
            tc.function.name,
            tc.function.arguments
          );
          this.messages.push({
            role: "tool",
            content: resultado,
            tool_call_id: tc.function.name, // usado como identificador único
          });
        }

        // Chama o modelo novamente com os resultados das tools
        resposta = await this.callOllama(this.messages, tools);
        iteracoes++;
      }

      // Adiciona a resposta final do assistente ao histórico
      const textoFinal = resposta.content || "(sem resposta)";
      this.messages.push({ role: "assistant", content: textoFinal });
      return textoFinal;
    } catch (error) {
      // Em caso de erro, remove a mensagem do usuário
      this.messages.pop();
      throw error;
    }
  }

  getHistory(): Message[] {
    return [...this.messages];
  }

  reset(): void {
    const systemPrompt = this.messages[0];
    this.messages.length = 0;
    this.messages.push(systemPrompt);
  }
}
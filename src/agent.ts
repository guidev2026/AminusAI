import { criarFerramentas, processarChamadaDeFuncao } from "./tools.js";
import {
  novaConversaId,
  salvarMensagem,
  carregarConversa,
} from "./memory.js";
import { augmentarPrompt } from "./rag.js";

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
  private readonly conversationId: string;
  private readonly systemPrompt: string;
  private ragAtivo: boolean = false;

  constructor(
    model: string,
    systemPrompt: string = "Você é um assistente amigável e prestativo.",
    conversationId?: string
  ) {
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.conversationId = conversationId ?? novaConversaId();

    const historico = carregarConversa(this.conversationId);
    if (historico.length > 0) {
      this.messages = historico;
    } else {
      this.messages = [{ role: "system", content: systemPrompt }];
      salvarMensagem(this.messages[0], this.conversationId);
    }
  }

  getConversationId(): string {
    return this.conversationId;
  }

  isRagAtivo(): boolean {
    return this.ragAtivo;
  }

  setRagAtivo(ativo: boolean): void {
    this.ragAtivo = ativo;
  }

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

  async process(userInput: string, usarRag: boolean = false): Promise<string> {
    const userMsg: Message = { role: "user", content: userInput };
    this.messages.push(userMsg);
    salvarMensagem(userMsg, this.conversationId);

    try {
      let mensagensParaEnvio = this.messages;
      let systemInjetado = false;

      if (usarRag || this.ragAtivo) {
        const systemAugmentado = await augmentarPrompt(userInput, this.systemPrompt);
        if (systemAugmentado !== this.systemPrompt) {
          mensagensParaEnvio = [
            { role: "system", content: systemAugmentado },
            ...this.messages.slice(1),
          ];
          systemInjetado = true;
        }
      }

      const tools = criarFerramentas();
      let resposta = await this.callOllama(mensagensParaEnvio, tools);

      let iteracoes = 0;
      const MAX_ITERACOES = 5;

      while (
        resposta.tool_calls &&
        resposta.tool_calls.length > 0 &&
        iteracoes < MAX_ITERACOES
      ) {
        const assistMsg: Message = {
          role: "assistant",
          content: resposta.content,
          tool_calls: resposta.tool_calls,
        };
        this.messages.push(assistMsg);
        salvarMensagem(assistMsg, this.conversationId);

        for (const tc of resposta.tool_calls) {
          const resultado = await processarChamadaDeFuncao(
            tc.function.name,
            tc.function.arguments
          );
          const toolMsg: Message = {
            role: "tool",
            content: resultado,
            tool_call_id: tc.function.name,
          };
          this.messages.push(toolMsg);
          salvarMensagem(toolMsg, this.conversationId);
        }

        mensagensParaEnvio = systemInjetado
          ? [
              { role: "system", content: (await augmentarPrompt(userInput, this.systemPrompt)) },
              ...this.messages.slice(1),
            ]
          : this.messages;

        resposta = await this.callOllama(mensagensParaEnvio, tools);
        iteracoes++;
      }

      const textoFinal = resposta.content || "(sem resposta)";
      const finalMsg: Message = { role: "assistant", content: textoFinal };
      this.messages.push(finalMsg);
      salvarMensagem(finalMsg, this.conversationId);
      return textoFinal;
    } catch (error) {
      this.messages.pop();
      throw error;
    }
  }

  getHistory(): Message[] {
    return [...this.messages];
  }

  reset(): void {
    this.messages.length = 0;
    this.messages.push({ role: "system", content: this.systemPrompt });
    salvarMensagem(this.messages[0], this.conversationId);
  }
}
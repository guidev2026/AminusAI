export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
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

  private async callOllama(): Promise<string> {
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages: this.messages, stream: false }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { message: Message; done: boolean };
    return data.message.content;
  }

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

  getHistory(): Message[] {
    return [...this.messages];
  }

  reset(): void {
    const systemPrompt = this.messages[0];
    this.messages.length = 0;
    this.messages.push(systemPrompt);
  }
}
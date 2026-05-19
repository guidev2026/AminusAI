import { Agent } from "./agent.js";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = readline.createInterface({ input, output });

const MODEL = "qwen2.5:7b-instruct-q3_K_M";
const SYSTEM_PROMPT = `
Você é um assistente amigável e prestativo chamado Solus.
Regras:
- Responda sempre em português brasileiro
- Seja claro e objetivo
- Se não souber algo, admita — não invente
- Mantenha um tom amigável e encorajador
`;

const agent = new Agent(MODEL, SYSTEM_PROMPT);

console.log(`
╔══════════════════════════════════════════╗
║        🤖 Agente Solus v1.0             ║
║                                          ║
║  Modelo: ${MODEL.padEnd(37)}║
║  Comandos:                               ║
║    /sair     - encerrar                  ║
║    /reset    - limpar conversa           ║
║    /history  - ver histórico             ║
╚══════════════════════════════════════════╝
`);

async function chatLoop(): Promise<void> {
  const input = await rl.question("\nVocê: ");
  const normalized = input.trim().toLowerCase();

  if (normalized === "/sair" || normalized === "/exit" || normalized === "/quit") {
    console.log("\nAté mais! 👋");
    rl.close();
    return;
  }

  if (normalized === "/reset") {
    agent.reset();
    console.log("\n🔄 Conversa resetada! Comece de novo.");
    await chatLoop();
    return;
  }

  if (normalized === "/history") {
    const history = agent.getHistory();
    console.log("\n📝 Histórico da conversa:");
    for (const msg of history) {
      const role = msg.role.padEnd(9);
      const preview = (msg.content ?? "").substring(0, 100) + ((msg.content?.length ?? 0) > 100 ? "..." : "");
      console.log(`  [${role}] ${preview}`);
    }
    await chatLoop();
    return;
  }

  try {
    console.log("\n🤖 Agente: ");
    const resposta = await agent.process(input);
    console.log(resposta);
    console.log(`\n(💡 ${agent.getHistory().length} mensagens no histórico | /reset para limpar)`);
  } catch (error) {
    console.error("\n❌ Erro:", error);
    if (error instanceof TypeError && error.message.includes("fetch")) {
      console.log("\n💡 Dica: Certifique-se de que o Ollama está rodando:");
      console.log("   ollama serve");
    } else {
      console.log("\n💡 Dica: Verifique se o modelo está baixado:");
      console.log(`   ollama pull ${MODEL}`);
    }
  }

  await chatLoop();
}

chatLoop().catch(console.error);
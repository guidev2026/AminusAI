import { Agent } from "./agent.js";
import {
  listarConversas,
  deletarConversa,
  fecharBanco,
} from "./memory.js";
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

const args = process.argv.slice(2);
const loadIndex = args.indexOf("--load");
const conversationIdArg =
  loadIndex !== -1 && args[loadIndex + 1] ? args[loadIndex + 1] : undefined;

const agent = new Agent(MODEL, SYSTEM_PROMPT, conversationIdArg);

console.log(`
╔══════════════════════════════════════════╗
║        🤖 Agente Solus v2.0             ║
║                                          ║
║  Modelo: ${MODEL.padEnd(37)}║
║  Conversa: ${(agent.getConversationId().substring(0, 8) + "...").padEnd(34)}║
║  Comandos:                               ║
║    /sair     - encerrar                  ║
║    /reset    - limpar conversa           ║
║    /history  - ver histórico             ║
║    /save     - mostrar ID da conversa    ║
║    /list     - listar conversas salvas   ║
║    /load     - carregar outra conversa   ║
║    /delete   - apagar uma conversa       ║
║    /rag      - ativar/desativar RAG      ║
║    /add      - adicionar à base de conh. ║
║    /stats    - estatísticas do RAG       ║
╚══════════════════════════════════════════╝
`);

async function chatLoop(): Promise<void> {
  const input = await rl.question("\nVocê: ");
  const normalized = input.trim().toLowerCase();

  if (normalized === "/sair" || normalized === "/exit" || normalized === "/quit") {
    fecharBanco();
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

  if (normalized === "/save") {
    console.log(`\n💾 ID da conversa atual: ${agent.getConversationId()}`);
    console.log("  Use: npm run dev -- --load <id>");
    await chatLoop();
    return;
  }

  if (normalized === "/list") {
    const conversas = listarConversas();
    if (conversas.length === 0) {
      console.log("\n📭 Nenhuma conversa salva ainda.");
    } else {
      console.log("\n📋 Conversas salvas:");
      for (const c of conversas) {
        const prefixo = c.id === agent.getConversationId() ? "▶ " : "  ";
        console.log(
          `${prefixo}${c.id.substring(0, 8)}... | ${c.created_at} | ${c.total} msgs | "${c.preview}"`
        );
      }
      console.log("\n  Para carregar uma: npm run dev -- --load <id>");
    }
    await chatLoop();
    return;
  }

  if (normalized.startsWith("/load ")) {
    const termo = input.trim().slice(6).trim();
    const conversas = listarConversas();

    const encontrada = conversas.find(
      (c) => c.id === termo || c.id.startsWith(termo)
    );

    if (encontrada) {
      console.log(`\n🔄 Para carregar "${encontrada.id.substring(0, 8)}...", rode:`);
      console.log(`  npm run dev -- --load ${encontrada.id}`);
      console.log(`  (ou feche este terminal e execute o comando acima)`);
    } else {
      console.log(`\n❌ Nenhuma conversa encontrada com "${termo}".`);
      console.log("  Use /list para ver as conversas disponíveis.");
    }
    await chatLoop();
    return;
  }

  if (normalized.startsWith("/delete ")) {
    const termo = input.trim().slice(8).trim();
    const conversas = listarConversas();
    const encontrada = conversas.find(
      (c) => c.id === termo || c.id.startsWith(termo)
    );

    if (encontrada) {
      deletarConversa(encontrada.id);
      console.log(`\n🗑️ Conversa "${encontrada.id.substring(0, 8)}..." deletada.`);
    } else {
      console.log(`\n❌ Nenhuma conversa encontrada com "${termo}".`);
    }
    await chatLoop();
    return;
  }

  if (normalized === "/rag") {
    const novoEstado = !agent.isRagAtivo();
    agent.setRagAtivo(novoEstado);
    console.log(`\n${novoEstado ? "✅" : "❌"} RAG ${novoEstado ? "ativado" : "desativado"}!`);
    console.log(`  ${novoEstado ? "Agora usarei a base de conhecimento para enriquecer respostas." : "Responderei apenas com meu conhecimento interno."}`);
    await chatLoop();
    return;
  }

  if (normalized === "/stats") {
    const { getStats } = await import("./rag.js");
    try {
      const stats = await getStats();
      console.log(`\n📊 Estatísticas da Base de Conhecimento:`);
      console.log(`  Total de chunks indexados: ${stats.totalChunks}`);
      console.log(`  Documentos:`);
      for (const [titulo, chunks] of Object.entries(stats.documentos)) {
        console.log(`    • ${titulo}: ${chunks} chunks`);
      }
    } catch (err) {
      console.log(`\n❌ Erro ao obter estatísticas: ${err}`);
      console.log("  Certifique-se de que o ChromaDB está rodando:");
      console.log("  chroma run --path ./data/chroma --port 8000");
    }
    await chatLoop();
    return;
  }

  if (normalized.startsWith("/add ") || normalized.startsWith("/add\n")) {
    const resto = input.trim().slice(4).trim();
    const primeiraQuebra = resto.indexOf("\n");
    if (primeiraQuebra === -1) {
      console.log(`\n❌ Formato: /add Título do documento`);
      console.log("   Conteúdo do documento aqui...");
      console.log("   (coloque o título na primeira linha e o conteúdo nas linhas seguintes)");
      await chatLoop();
      return;
    }
    const titulo = resto.substring(0, primeiraQuebra).trim();
    const conteudo = resto.substring(primeiraQuebra + 1).trim();

    if (!titulo || !conteudo) {
      console.log(`\n❌ Título e conteúdo são obrigatórios.`);
      await chatLoop();
      return;
    }

    const { addDocument } = await import("./rag.js");
    try {
      console.log(`\n📚 Adicionando "${titulo}" à base de conhecimento...`);
      const chunks = await addDocument(titulo, conteudo);
      console.log(`✅ Documento adicionado (${chunks} chunks).`);
      console.log("  Agora você pode perguntar sobre o conteúdo!");
    } catch (err) {
      console.log(`\n❌ Erro ao adicionar: ${err}`);
      console.log("  Certifique-se de que o ChromaDB está rodando:");
      console.log("  chroma run --path ./data/chroma --port 8000");
    }
    await chatLoop();
    return;
  }

  try {
    console.log("\n🤖 Agente: ");
    const usarRag = agent.isRagAtivo();
    const resposta = await agent.process(input, usarRag);
    console.log(resposta);
    console.log(`\n(💡 ${agent.getHistory().length} mensagens | /reset limpa | /save pega o ID)`);
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
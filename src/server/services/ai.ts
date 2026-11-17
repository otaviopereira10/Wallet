import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

/**
 * Optional AI layer for Isabelle Intelligence. It runs only on the server, only
 * when an API key is configured AND the user enabled it in Settings. The model
 * receives the deterministic answer (computed by the financial engine) plus a
 * compact summary of the user's data, and is instructed to rephrase/expand it
 * without inventing numbers. The app works fully without it.
 */
const DEFAULT_MODEL = "claude-opus-5-5";
// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1", "claude-sonnet-5-5"]);

const SYSTEM_PROMPT = `Você é a Isabelle, assistente financeira pessoal do aplicativo Isabelle Wallet. Você conversa com a dona da conta em português do Brasil.

Regras obrigatórias:
- Use somente os números, datas e nomes que aparecem em RESPOSTA_CALCULADA e DADOS. Nunca invente valores, receitas, despesas, taxas de juros ou cotações.
- RESPOSTA_CALCULADA foi produzida pelo motor financeiro do app e é a fonte da verdade. Você pode explicá-la e organizá-la, mas não pode contradizê-la nem recalcular com outros números.
- Se faltar informação para responder, diga exatamente o que falta e onde cadastrar no app.
- Organize a resposta em quatro partes curtas: **Situação** (problema ou oportunidade), **O que fazer** (ação recomendada), **Impacto estimado** e **Riscos e limitações**.
- Projeções não são garantias: mencione as premissas usadas.
- Nunca recomende atrasar contas essenciais (moradia, alimentação, saúde, transporte, educação) para pagar algo de menor importância.
- Você não realiza pagamentos nem movimenta dinheiro; apenas orienta.
- Você não é consultora de investimentos licenciada; não recomende produtos financeiros específicos.
- Seja direta e acolhedora, em no máximo 200 palavras.`;

export function aiAvailable(): boolean {
  return !!env.aiApiKey;
}

export async function explainWithAI(
  question: string,
  calculated: unknown,
  data: unknown,
): Promise<{ ok: true; text: string; model: string } | { ok: false; error: string }> {
  if (!env.aiApiKey) return { ok: false, error: "IA não configurada no servidor." };
  const model = env.aiModel ?? DEFAULT_MODEL;
  const client = new Anthropic({
    apiKey: env.aiApiKey,
    ...(env.aiBaseUrl ? { baseURL: env.aiBaseUrl } : {}),
    timeout: 60_000,
    maxRetries: 1,
  });
  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      output_config: { effort: "medium" },
      ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `PERGUNTA:\n${question}\n\nRESPOSTA_CALCULADA:\n${JSON.stringify(calculated)}\n\nDADOS:\n${JSON.stringify(data)}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "A IA não pôde responder a esta pergunta. A resposta calculada acima continua válida." };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) return { ok: false, error: "A IA não retornou texto." };
    return { ok: true, text, model: response.model };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "Chave da API de IA inválida (verifique AI_API_KEY)." };
    if (error instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "A chave da API não tem permissão para este modelo." };
    if (error instanceof Anthropic.NotFoundError) return { ok: false, error: `Modelo de IA não encontrado: ${model}.` };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "Limite de uso da IA atingido. Tente novamente em instantes." };
    if (error instanceof Anthropic.BadRequestError) return { ok: false, error: "A requisição à IA foi recusada (configuração inválida)." };
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, error: "Sem conexão com o serviço de IA." };
    if (error instanceof Anthropic.APIError) return { ok: false, error: `Serviço de IA indisponível (${error.status ?? "erro"}).` };
    return { ok: false, error: "Falha ao consultar a IA." };
  }
}

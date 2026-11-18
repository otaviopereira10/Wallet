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

const SYSTEM_PROMPT = `You are Isabelle, the personal finance assistant inside the Isabelle Wallet app. You talk to the account owner in clear, simple English.

Rules you must follow:
- Use only the numbers, dates and names that appear in CALCULATED_ANSWER and DATA. Never invent amounts, income, expenses, interest rates or exchange rates.
- CALCULATED_ANSWER comes from the app's financial engine and is the source of truth. You may explain and organize it, but never contradict it or recalculate with other numbers.
- If information is missing, say exactly what is missing and where to add it in the app.
- Organize the answer in four short parts: **Situation** (problem or opportunity), **What to do** (recommended action), **Estimated impact**, and **Risks and limits**.
- Projections are not guarantees: mention the assumptions used.
- Never suggest paying an essential bill (housing, food, health, transportation, education) late to pay for something less important.
- You do not make payments or move money; you only give guidance.
- You are not a licensed financial adviser; do not recommend specific financial products.
- Be direct and warm, in at most 200 words.`;

export function aiAvailable(): boolean {
  return !!env.aiApiKey;
}

export async function explainWithAI(
  question: string,
  calculated: unknown,
  data: unknown,
): Promise<{ ok: true; text: string; model: string } | { ok: false; error: string }> {
  if (!env.aiApiKey) return { ok: false, error: "AI is not set up on the server." };
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
          content: `QUESTION:\n${question}\n\nCALCULATED_ANSWER:\n${JSON.stringify(calculated)}\n\nDATA:\n${JSON.stringify(data)}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return { ok: false, error: "The AI could not answer this question. The calculated answer above is still valid." };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) return { ok: false, error: "The AI returned no text." };
    return { ok: true, text, model: response.model };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "Invalid AI API key (check AI_API_KEY)." };
    if (error instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "The API key does not have access to this model." };
    if (error instanceof Anthropic.NotFoundError) return { ok: false, error: `AI model not found: ${model}.` };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "AI usage limit reached. Try again in a moment." };
    if (error instanceof Anthropic.BadRequestError) return { ok: false, error: "The AI request was rejected (invalid configuration)." };
    if (error instanceof Anthropic.APIConnectionError) return { ok: false, error: "Could not reach the AI service." };
    if (error instanceof Anthropic.APIError) return { ok: false, error: `AI service unavailable (${error.status ?? "error"}).` };
    return { ok: false, error: "The AI request failed." };
  }
}

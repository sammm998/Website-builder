import Anthropic from "@anthropic-ai/sdk";
import { AiError, type AiProvider, type ObjectRequest, type ObjectResult, type Usage } from "./provider";
import { toOutputSchema } from "./json-schema";

/** USD per million tokens (input, output) for cost tracking; cache writes/reads are weighted in usageOf. */
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-1": [10, 50],
};

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  /** Model for high-volume, lower-difficulty calls (translation). Defaults to `model`. */
  fastModel?: string;
  /** Purposes routed to the fast model. */
  fastPurposes?: string[];
  fetch?: typeof fetch;
}

/**
 * Claude provider: adaptive thinking (always on for Opus 5.5) with explicit effort, streamed so long
 * code generations never hit HTTP timeouts, JSON-schema structured output validated again with zod,
 * server-side refusal fallback, and no automatic retries (billed work only runs on explicit user action).
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;
  private fastModel: string;
  private fastPurposes: Set<string>;

  constructor(opts: AnthropicProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new AiError("ANTHROPIC_API_KEY is not configured.", "config");
    this.client = new Anthropic({ apiKey, maxRetries: 0, timeout: 20 * 60 * 1000, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
    this.model = opts.model ?? process.env["AI_MODEL"] ?? "claude-opus-5-5";
    this.fastModel = opts.fastModel ?? process.env["AI_MODEL_FAST"] ?? this.model;
    this.fastPurposes = new Set(opts.fastPurposes ?? ["translate"]);
  }

  async generateObject<T>(req: ObjectRequest<T>): Promise<ObjectResult<T>> {
    const model = this.fastPurposes.has(req.purpose) ? this.fastModel : this.model;
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const image of req.images ?? []) {
      content.push({ type: "text", text: image.label });
      content.push({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data.toString("base64") } });
    }
    // Cached prefix: system, images and shared context; only the prompt varies between related calls.
    if (req.context) content.push({ type: "text", text: req.context, cache_control: { type: "ephemeral" } });
    content.push({ type: "text", text: req.prompt });

    let message: Anthropic.Beta.BetaMessage;
    try {
      const stream = this.client.beta.messages.stream({
        model,
        max_tokens: req.maxTokens ?? 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: req.effort ?? "high", format: { type: "json_schema", schema: toOutputSchema(req.schema) } },
        // Stable system prompt first so repeated calls share the cached prefix.
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
      });
      message = await stream.finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) throw new AiError("Claude is rate limited right now. Try again in a minute.", "rate_limit");
      if (error instanceof Anthropic.AuthenticationError) throw new AiError("The Anthropic API key is invalid.", "config");
      if (error instanceof Anthropic.BadRequestError) throw new AiError(`Claude rejected the request: ${error.message}`, "api");
      if (error instanceof Anthropic.InternalServerError) throw new AiError("Claude is temporarily unavailable.", "overloaded");
      if (error instanceof Anthropic.APIConnectionError) throw new AiError("Could not reach Claude. Check the connection and try again.", "api");
      if (error instanceof Anthropic.APIError) throw new AiError(`Claude API error ${error.status}: ${error.message}`, "api");
      throw new AiError(`Claude request failed: ${(error as Error).message}`, "api");
    }

    const usage = usageOf(message, model, req.purpose);
    if (message.stop_reason === "refusal") {
      throw new AiError(`Claude declined this request${message.stop_details?.category ? ` (${message.stop_details.category})` : ""}.`, "refusal", usage);
    }
    if (message.stop_reason === "max_tokens") throw new AiError("The response was cut off (max tokens).", "truncated", usage);
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiError("Claude returned invalid JSON.", "invalid_output", usage);
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) {
      throw new AiError(`Claude output did not match the schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, "invalid_output", usage);
    }
    return { data: parsed.data, usage };
  }
}

function usageOf(message: Anthropic.Beta.BetaMessage, model: string, purpose: string): Usage {
  const served = message.model || model;
  const [inPrice, outPrice] = PRICES[served] ?? PRICES[model] ?? [4, 20];
  const u = message.usage;
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  const output = u.output_tokens ?? 0;
  return {
    provider: "anthropic",
    model: served,
    purpose,
    inputTokens: Math.round(input),
    outputTokens: output,
    costUsd: Number(((input * inPrice + output * outPrice) / 1_000_000).toFixed(4)),
  };
}

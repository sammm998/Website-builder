import { AiError, AnthropicProvider, type AiProvider, type ObjectRequest, type ObjectResult } from "@redesign/ai";
import { ANTHROPIC_KEY_SETTING, decryptSetting } from "@redesign/ai/secrets";
import type { Sql } from "./db";

/**
 * Claude provider whose API key comes from the environment or, when unset, from the key the owner
 * entered in the app (app_settings, encrypted). Resolved per call, so a key saved while the worker runs
 * is used by the next job without a restart.
 */
export class LazyAnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private cached: { key: string; provider: AnthropicProvider } | null = null;

  constructor(private sql: Sql) {}

  async apiKey(): Promise<string | null> {
    const fromEnv = process.env["ANTHROPIC_API_KEY"]?.trim();
    if (fromEnv) return fromEnv;
    const [row] = await this.sql<{ value: string }[]>`select value from app_settings where key = ${ANTHROPIC_KEY_SETTING}`.catch(() => []);
    return row ? decryptSetting(row.value) : null;
  }

  async generateObject<T>(req: ObjectRequest<T>): Promise<ObjectResult<T>> {
    const key = await this.apiKey();
    if (!key) throw new AiError("ANTHROPIC_API_KEY is not configured.", "config");
    if (this.cached?.key !== key) this.cached = { key, provider: new AnthropicProvider({ apiKey: key }) };
    return this.cached.provider.generateObject(req);
  }
}

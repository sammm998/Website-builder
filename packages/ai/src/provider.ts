import type { z } from "zod";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ImageInput {
  data: Buffer;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  /** Short label placed before the image so the model knows what it is. */
  label: string;
}

export interface ObjectRequest<T> {
  /** Telemetry/cost label, e.g. "direction", "page", "translate". */
  purpose: string;
  system: string;
  prompt: string;
  images?: ImageInput[];
  schema: z.ZodType<T>;
  effort?: Effort;
  maxTokens?: number;
}

export interface Usage {
  provider: string;
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ObjectResult<T> {
  data: T;
  usage: Usage;
}

export interface AiProvider {
  readonly name: string;
  generateObject<T>(req: ObjectRequest<T>): Promise<ObjectResult<T>>;
}

/** Raised for failures that must pause the job (never retried automatically). */
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "refusal" | "rate_limit" | "overloaded" | "invalid_output" | "truncated" | "api",
    readonly usage?: Usage,
  ) {
    super(message);
    this.name = "AiError";
  }
}

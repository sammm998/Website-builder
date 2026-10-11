export * from "./provider";
export { AnthropicProvider, type AnthropicProviderOptions } from "./anthropic";
export { FakeProvider } from "./fake";
export * from "./pipeline";
export * from "./validate";
export * from "./content";
export { templateHeader, templateFooter, templateHero, templateSection } from "./template";
export { DESIGNER_SYSTEM } from "./prompts/designer";
export { toOutputSchema } from "./json-schema";
export type { Brief, Critique } from "./schemas";

import { AnthropicProvider } from "./anthropic";
import { FakeProvider } from "./fake";
import type { AiProvider } from "./provider";

/** Provider from environment: AI_PROVIDER=fake for keyless development/tests, otherwise Claude. */
export function providerFromEnv(): AiProvider {
  return process.env["AI_PROVIDER"] === "fake" ? new FakeProvider() : new AnthropicProvider();
}

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicProvider, AiError } from "../src";

function sse(events: Record<string, unknown>[]): Response {
  const body = events.map((e) => `event: ${e["type"]}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function messageEvents(text: string, stop = "end_turn") {
  return [
    { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 500 } },
    { type: "message_stop" },
  ];
}

describe("AnthropicProvider", () => {
  it("streams a structured request with adaptive thinking, effort, schema and fallbacks", async () => {
    let captured: { url: string; headers: Headers; body: Record<string, any> } | null = null;
    const fetchMock = (async (url: string, init: RequestInit) => {
      captured = { url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
      return sse(messageEvents(JSON.stringify({ greeting: "Hej" })));
    }) as unknown as typeof fetch;
    const provider = new AnthropicProvider({ apiKey: "test", fetch: fetchMock });
    const result = await provider.generateObject({ purpose: "page", system: "sys", prompt: "hi", schema: z.object({ greeting: z.string() }), effort: "high" });
    expect(result.data).toEqual({ greeting: "Hej" });
    expect(result.usage.costUsd).toBeCloseTo((1000 * 4 + 500 * 20) / 1e6, 6);
    const body = captured!.body;
    expect(captured!.url).toContain("/v1/messages");
    expect(body["model"]).toBe("claude-opus-5-5");
    expect(body["stream"]).toBe(true);
    expect(body["thinking"]).toEqual({ type: "adaptive" });
    expect(body["output_config"]["effort"]).toBe("high");
    expect(body["output_config"]["format"]["type"]).toBe("json_schema");
    expect(body["output_config"]["format"]["schema"]["additionalProperties"]).toBe(false);
    expect(body["fallbacks"]).toBe("default");
    expect(body["temperature"]).toBeUndefined();
    expect(body["system"][0]["cache_control"]).toEqual({ type: "ephemeral" });
    expect(captured!.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("puts shared context after the images with a cache breakpoint, before the varying prompt", async () => {
    let body: Record<string, any> = {};
    const fetchMock = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return sse(messageEvents(JSON.stringify({ ok: true })));
    }) as unknown as typeof fetch;
    const provider = new AnthropicProvider({ apiKey: "test", fetch: fetchMock });
    await provider.generateObject({
      purpose: "page",
      system: "sys",
      context: "SHARED DESIGN SYSTEM",
      prompt: "page specific",
      images: [{ data: Buffer.from("img"), mediaType: "image/jpeg", label: "Reference:" }],
      schema: z.object({ ok: z.boolean() }),
      effort: "medium",
    });
    const content = body["messages"][0]["content"];
    expect(content.map((c: { type: string }) => c.type)).toEqual(["text", "image", "text", "text"]);
    expect(content[2]).toEqual({ type: "text", text: "SHARED DESIGN SYSTEM", cache_control: { type: "ephemeral" } });
    expect(content[3]).toEqual({ type: "text", text: "page specific" });
    expect(body["output_config"]["effort"]).toBe("medium");
  });

  it("maps refusals and invalid output to non-retried AiErrors", async () => {
    const refusal = new AnthropicProvider({ apiKey: "t", fetch: (async () => sse(messageEvents("", "refusal"))) as unknown as typeof fetch });
    await expect(refusal.generateObject({ purpose: "x", system: "s", prompt: "p", schema: z.object({}) })).rejects.toMatchObject({ kind: "refusal" });
    const invalid = new AnthropicProvider({ apiKey: "t", fetch: (async () => sse(messageEvents('{"wrong":1}'))) as unknown as typeof fetch });
    await expect(invalid.generateObject({ purpose: "x", system: "s", prompt: "p", schema: z.object({ a: z.string() }) })).rejects.toBeInstanceOf(AiError);
  });

  it("requires an API key", () => {
    const prev = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    expect(() => new AnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/);
    if (prev) process.env["ANTHROPIC_API_KEY"] = prev;
  });
});

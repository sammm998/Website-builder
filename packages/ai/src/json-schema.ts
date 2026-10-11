import { z } from "zod";

const UNSUPPORTED = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "multipleOf", "default", "$schema", "uniqueItems"];

/**
 * Converts a zod schema to the JSON-schema subset accepted by structured outputs: every object is
 * closed (`additionalProperties: false`) with all properties required; numeric/string constraints are
 * stripped here and enforced afterwards by validating the result with the original zod schema.
 */
export function toOutputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any", io: "input" }) as Record<string, unknown>;
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== "object") return node;
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (UNSUPPORTED.includes(k)) continue;
      obj[k] = visit(v);
    }
    if (obj["type"] === "object" && obj["properties"] && typeof obj["properties"] === "object") {
      obj["additionalProperties"] = false;
      obj["required"] = Object.keys(obj["properties"] as object);
    }
    return obj;
  };
  return visit(json) as Record<string, unknown>;
}

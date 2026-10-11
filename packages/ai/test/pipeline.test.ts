import { describe, expect, it } from "vitest";
import { MEDIA, ORIGIN, sampleSourcePage } from "@redesign/fixtures";
import { normalizeText, sectionTexts, type GeneratedSection } from "@redesign/schema";
import { sanitizeFragment, textSegments } from "@redesign/sanitizer";
import {
  FakeProvider,
  analyzeSite,
  directionIndices,
  enforceContrast,
  generateDirection,
  generatePage,
  planDirections,
  toOutputSchema,
  translateFragments,
  validateSections,
  type AiProvider,
  type ObjectRequest,
  type ValidationContext,
} from "../src";
import { directionOutput } from "../src/schemas";

const validation: ValidationContext = { origin: ORIGIN, mediaIds: new Set(Object.values(MEDIA)), formKeys: new Set(["form-1"]) };

describe("structured output schema", () => {
  it("closes objects, requires all properties and strips unsupported constraints", () => {
    const schema = toOutputSchema(directionOutput) as Record<string, any>;
    expect(schema["additionalProperties"]).toBe(false);
    expect(schema["required"]).toEqual(["name", "rationale", "designSystem", "headerHtml", "footerHtml", "sections"]);
    const colors = schema["properties"]["designSystem"]["properties"]["colors"];
    expect(colors["additionalProperties"]).toBe(false);
    expect(colors["properties"]["bg"]["type"]).toBe("string");
    expect(JSON.stringify(schema)).not.toMatch(/"pattern"|"minimum"|"maximum"|"minLength"/);
    expect(schema["properties"]["designSystem"]["properties"]["typography"]["properties"]["display"]["enum"]).toContain("fraunces");
  });
});

describe("pipeline with the deterministic provider", () => {
  const ai = new FakeProvider();
  const usage: string[] = [];
  const deps = { ai, onUsage: (u: { purpose: string }) => void usage.push(u.purpose) };
  const ctx = {
    home: sampleSourcePage,
    analysis: undefined as never,
    validation,
    inspiration: [],
  };

  it("analyses, plans three directions and generates each without losing content", async () => {
    const analysis = await analyzeSite(deps, { pages: [sampleSourcePage], seoSummary: { score: 70, failing: [] }, screenshots: [], outputLanguage: "sv", origin: ORIGIN });
    expect(analysis.tone).toBeTruthy();
    const c = { ...ctx, analysis };
    const briefs = await planDirections(deps, c);
    expect(briefs).toHaveLength(3);
    const results = await Promise.all(briefs.map((b) => generateDirection(deps, c, b, briefs.filter((x) => x !== b))));
    expect(new Set(results.map((r) => r.direction.designSystem.typography.display)).size).toBe(3);
    for (const { direction, warnings } of results) {
      expect(direction.sections.map((s) => s.sourceIndex)).toEqual(directionIndices(sampleSourcePage));
      expect(warnings.filter((w) => w.severity === "high")).toEqual([]);
      const text = normalizeText(direction.sections.map((s) => sanitizeFragment(s.html, { isKnownMedia: () => true }).text).join(" "));
      for (const t of [sampleSourcePage.hero, ...sampleSourcePage.sections].flatMap(sectionTexts)) expect(text).toContain(normalizeText(t));
      expect(direction.headerHtml).toContain('data-toggle="menu"');
      expect(direction.headerHtml).toContain(`media:${MEDIA.logo}`);
      expect(direction.footerHtml).toContain("Org.nr 556000-0000");
    }
    expect(usage).toEqual(expect.arrayContaining(["analysis", "briefs", "direction"]));
  });

  it("generates full pages reusing existing sections and translates structure-preservingly", async () => {
    const analysis = await analyzeSite(deps, { pages: [sampleSourcePage], seoSummary: { score: 70, failing: [] }, screenshots: [], outputLanguage: "sv", origin: ORIGIN });
    const briefs = await planDirections(deps, { ...ctx, analysis });
    const { direction } = await generateDirection(deps, { ...ctx, analysis }, briefs[1]!, []);
    const existing = direction.sections.filter((s) => s.sourceIndex < 1);
    const page = await generatePage(deps, { direction, validation }, sampleSourcePage, existing);
    expect(page.sections.map((s) => s.sourceIndex)).toEqual([-1, 0, 1, 2]);
    expect(page.sections[0]).toBe(existing[0]);
    const html = page.sections.map((s) => s.html);
    const translated = await translateFragments(deps, html, "sv", "en", ["Byggfirma Ek"]);
    expect(translated).toHaveLength(html.length);
    translated.forEach((t, i) => {
      const markup = (x: string) => x.replace(/>[^<]*</g, "><").replace(/alt="[^"]*"/g, 'alt=""');
      expect(markup(t)).toBe(markup(html[i]!)); // identical markup
      expect(textSegments(t).every((s) => s.startsWith("[EN] "))).toBe(true);
    });
  });
});

describe("repair flow", () => {
  class BadThenGood implements AiProvider {
    readonly name = "bad";
    purposes: string[] = [];
    private inner = new FakeProvider();
    async generateObject<T>(req: ObjectRequest<T>) {
      this.purposes.push(req.purpose);
      const result = await this.inner.generateObject(req);
      if (req.purpose === "page") {
        const data = result.data as unknown as { sections: GeneratedSection[] };
        data.sections = data.sections.map((s) =>
          s.sourceIndex === 0 ? { ...s, html: `<section><h2>Våra tjänster</h2><img src="https://evil.example/x.jpg"><script>alert(1)</script></section>` } : s,
        );
      }
      if (req.purpose === "repair") {
        const data = result.data as unknown as { sections: GeneratedSection[] };
        // Repair still drops a paragraph: the deterministic fallback must restore it.
        data.sections = data.sections.map((s) => (s.sourceIndex === 0 ? { ...s, html: s.html.replace("Från första skiss till sista penseldrag.", "") } : s));
      }
      return result;
    }
  }

  it("repairs once, then guarantees verbatim content and strips unsafe markup", async () => {
    const ai = new BadThenGood();
    const fake = new FakeProvider();
    const briefs = (await fake.generateObject({ purpose: "briefs", system: "", prompt: "", schema: (await import("../src/schemas")).briefsOutput })).data.directions;
    const { direction } = await generateDirection({ ai: fake }, { home: sampleSourcePage, analysis: {} as never, validation, inspiration: [] }, briefs[0]!, []);
    const result = await generatePage({ ai }, { direction, validation }, sampleSourcePage);
    expect(ai.purposes.filter((p) => p === "repair")).toHaveLength(1);
    const services = result.sections.find((s) => s.sourceIndex === 0)!;
    expect(services.html).not.toContain("<script");
    expect(services.html).not.toContain("evil.example");
    expect(services.html).toContain("Från första skiss till sista penseldrag.");
    expect(services.html).toContain("data-restored-content");
    const check = validateSections(sampleSourcePage, result.sections, [-1, 0, 1, 2], validation);
    expect(check.issues.filter((i) => /Missing or altered source text/.test(i.message))).toEqual([]);
  });
});

describe("enforceContrast", () => {
  it("fixes unreadable text colours deterministically", async () => {
    const { sampleDesignSystem } = await import("@redesign/fixtures");
    const bad = { ...sampleDesignSystem, colors: { ...sampleDesignSystem.colors, muted: "#333333", "accent-fg": "#b0e050" } };
    const fixed = enforceContrast(bad);
    const { designSystemContrastIssues } = await import("@redesign/schema");
    expect(designSystemContrastIssues(fixed)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  designSystemSchema,
  designSystemContrastIssues,
  motionVocabularyDoc,
  normalizeMotionParam,
  normalizeText,
  sectionTexts,
} from "../src";

export const sampleDesignSystem = {
  name: "Nordic Editorial",
  mode: "light",
  colors: { bg: "#F7F5F0", surface: "#FFFFFF", "surface-2": "#ECE8DF", fg: "#14130F", muted: "#5B574E", line: "#D9D3C7", accent: "#1D4ED8", "accent-fg": "#FFFFFF", brand: "#1D4ED8" },
  typography: { display: "fraunces", body: "inter", displayWeight: 500, bodyWeight: 400, displayTracking: "tight", displayCase: "normal", scale: 1.333, baseSize: 17 },
  shape: { radius: "lg", borderWidth: 1 },
  layout: { container: 1320, sectionSpacing: "airy", gutter: "normal" },
  motion: { personality: "editorial", smoothScroll: true, intensity: 0.6, cursor: "none", pageTransition: "fade" },
  texture: { grain: true, accents: "lines" },
};

describe("design system", () => {
  it("parses and lowercases colors", () => {
    const ds = designSystemSchema.parse(sampleDesignSystem);
    expect(ds.colors.bg).toBe("#f7f5f0");
    expect(designSystemContrastIssues(ds)).toEqual([]);
  });
  it("rejects unknown fonts", () => {
    expect(designSystemSchema.safeParse({ ...sampleDesignSystem, typography: { ...sampleDesignSystem.typography, display: "comic-sans" } }).success).toBe(false);
  });
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});

describe("motion vocabulary", () => {
  it("documents every effect", () => {
    const doc = motionVocabularyDoc();
    expect(doc).toContain("`split-text`");
    expect(doc).toContain("webgl");
  });
  it("normalizes params", () => {
    expect(normalizeMotionParam("parallax", "speed", "5")).toBe("1");
    expect(normalizeMotionParam("reveal", "direction", "left")).toBe("left");
    expect(normalizeMotionParam("reveal", "direction", "sideways")).toBeNull();
    expect(normalizeMotionParam("tilt-3d", "glare", "yes")).toBeNull();
  });
});

describe("text", () => {
  it("normalizes whitespace, quotes and keeps å ä ö", () => {
    expect(normalizeText("  Välkommen till “Åre” – här\n\n")).toBe('Välkommen till "Åre" - här');
  });
  it("collects verbatim section texts", () => {
    expect(
      sectionTexts({
        heading: "Om oss",
        blocks: [
          { type: "paragraph", text: "Vi är ett företag." },
          { type: "list", ordered: false, items: ["Ett", "Två"] },
          { type: "links", links: [{ label: "Kontakta oss", href: "/kontakt", internal: true, primary: true }] },
        ],
      }),
    ).toEqual(["Om oss", "Vi är ett företag.", "Ett", "Två", "Kontakta oss"]);
  });
});

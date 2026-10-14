import type { DesignSystem } from "@redesign/schema";
import type { AiProvider, ObjectRequest, ObjectResult } from "./provider";
import type { PromptSection } from "./content";
import { templateFooter, templateHeader, templateHero, templateSection } from "./template";

/**
 * Deterministic provider for tests and keyless local development. It reads the tagged JSON inputs the
 * pipeline puts in prompts and answers with schema-valid output built by the template composer.
 * Translations are marked with the target language code so tests can verify the round-trip.
 */

const PRESETS: DesignSystem[] = [
  {
    name: "Redaktionell",
    mode: "light",
    colors: { bg: "#f6f3ec", surface: "#ffffff", "surface-2": "#ebe6db", fg: "#16150f", muted: "#5d594f", line: "#d8d2c5", accent: "#1f3d2b", "accent-fg": "#f6f3ec", brand: "#1f3d2b" },
    typography: { display: "instrument-serif", body: "inter", displayWeight: 400, bodyWeight: 400, displayTracking: "tight", displayCase: "normal", scale: 1.333, baseSize: 17 },
    shape: { radius: "sm", borderWidth: 1 },
    layout: { container: 1280, sectionSpacing: "airy", gutter: "normal" },
    motion: { personality: "editorial", smoothScroll: true, intensity: 0.55, cursor: "none", pageTransition: "fade" },
    texture: { grain: true, accents: "lines" },
  },
  {
    name: "Filmisk",
    mode: "dark",
    colors: { bg: "#0c0d0b", surface: "#151713", "surface-2": "#20231d", fg: "#f2efe7", muted: "#a6a296", line: "#2c3027", accent: "#c8f169", "accent-fg": "#0c0d0b", brand: "#0b6e4f" },
    typography: { display: "fraunces", body: "inter-tight", displayWeight: 400, bodyWeight: 400, displayTracking: "tight", displayCase: "normal", scale: 1.3, baseSize: 17 },
    shape: { radius: "xl", borderWidth: 1 },
    layout: { container: 1320, sectionSpacing: "cinematic", gutter: "normal" },
    motion: { personality: "cinematic", smoothScroll: true, intensity: 0.8, cursor: "ring", pageTransition: "curtain" },
    texture: { grain: true, accents: "gradients" },
  },
  {
    name: "Kinetisk",
    mode: "light",
    colors: { bg: "#ffffff", surface: "#f2f2f2", "surface-2": "#e6e6e6", fg: "#0a0a0a", muted: "#555555", line: "#dddddd", accent: "#ff4d00", "accent-fg": "#0a0a0a", brand: "#ff4d00" },
    typography: { display: "big-shoulders-display", body: "space-grotesk", displayWeight: 800, bodyWeight: 400, displayTracking: "normal", displayCase: "uppercase", scale: 1.5, baseSize: 17 },
    shape: { radius: "none", borderWidth: 2 },
    layout: { container: 1440, sectionSpacing: "normal", gutter: "tight" },
    motion: { personality: "kinetic", smoothScroll: true, intensity: 0.9, cursor: "blend", pageTransition: "curtain" },
    texture: { grain: false, accents: "shapes" },
  },
];

function tagged<T>(prompt: string, tag: string): T | null {
  const m = new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(prompt);
  return m ? (JSON.parse(m[1]!) as T) : null;
}

export class FakeProvider implements AiProvider {
  readonly name = "fake";
  calls: { purpose: string; prompt: string; context?: string; effort?: string }[] = [];

  async generateObject<T>(req: ObjectRequest<T>): Promise<ObjectResult<T>> {
    this.calls.push({ purpose: req.purpose, prompt: req.prompt, context: req.context, effort: req.effort });
    const data = this.answer(req);
    const parsed = req.schema.parse(data);
    return { data: parsed, usage: { provider: "fake", model: "fake", purpose: req.purpose, inputTokens: Math.round(req.prompt.length / 4), outputTokens: Math.round(JSON.stringify(data).length / 4), costUsd: 0 } };
  }

  private answer(req: ObjectRequest<unknown>): unknown {
    const p = `${req.context ?? ""}\n\n${req.prompt}`;
    switch (req.purpose) {
      case "analysis":
        return {
          businessType: "Lokalt tjänsteföretag",
          audience: "Privatpersoner och företag i närområdet",
          tone: "Trygg, personlig och saklig",
          positioning: "Kvalitet och lokal närvaro",
          recommendedDirection: "Modern premiumkänsla med tydliga tjänster och stark kontaktväg",
          strengths: ["Tydligt erbjudande", "Konkreta kontaktuppgifter"],
          weaknesses: ["Daterad visuell design", "Svag hierarki på mobil"],
          contentNotes: "Innehållet bevaras ordagrant.",
          seoFindings: [{ severity: "medium", title: "Metadata", detail: "Se SEO-rapporten för detaljer." }],
        };
      case "briefs":
        return {
          directions: PRESETS.map((d) => ({ name: d.name, concept: `${d.name} riktning`, mode: d.mode, color: "brand", typography: d.typography.display, layout: "asymmetrisk", motion: d.motion.personality, hero: "stor rubrik" })),
        };
      case "direction": {
        const brief = tagged<{ name: string }>(p, "brief");
        const ds = PRESETS.find((d) => d.name === brief?.name) ?? PRESETS[0]!;
        const nav = tagged<{ logo: string | null; nav: { label: string; href: string; primary: boolean }[]; footer: PromptSection }>(p, "site_navigation")!;
        const source = tagged<{ sections: PromptSection[] }>(p, "source")!;
        return {
          name: ds.name,
          rationale: `${ds.name}: en tydligt egen riktning byggd på varumärkets färger.`,
          designSystem: ds,
          headerHtml: templateHeader(nav.nav, nav.logo, "Startsida"),
          footerHtml: templateFooter(nav.footer),
          sections: source.sections.map((s) => (s.sourceIndex === -1 ? { sourceIndex: -1, archetype: "hero", html: templateHero(s, ds) } : { sourceIndex: s.sourceIndex, ...templateSection(s, s.sourceIndex) })),
        };
      }
      case "page":
      case "repair": {
        const source = tagged<{ sections: PromptSection[] }>(p, "source")!;
        const ds = (tagged<{ designSystem?: DesignSystem }>(p, "approved") ?? {}).designSystem ?? PRESETS[1]!;
        const layout = tagged<{ headerHtml: string; footerHtml: string }>(p, "current_layout");
        const nav = tagged<{ logo: string | null; nav: { label: string; href: string; primary: boolean }[]; footer: PromptSection }>(p, "site_navigation");
        const sections = source.sections.map((s) => (s.sourceIndex === -1 ? { sourceIndex: -1, archetype: "hero", html: templateHero(s, ds) } : { sourceIndex: s.sourceIndex, ...templateSection(s, s.sourceIndex) }));
        if (req.purpose === "page") return { sections };
        return {
          sections,
          headerHtml: layout && nav ? templateHeader(nav.nav, nav.logo, "Startsida") : layout?.headerHtml ?? "",
          footerHtml: layout && nav ? templateFooter(nav.footer) : layout?.footerHtml ?? "",
        };
      }
      case "translate": {
        const lang = /to ([A-Za-zåäöÅÄÖ ]+)\./.exec(p)?.[1]?.trim().slice(0, 2).toUpperCase() ?? "XX";
        const segments = tagged<string[]>(p, "segments");
        if (segments) return { segments: segments.map((s) => `[${lang}] ${s}`) };
        const meta = tagged<{ title: string; description: string }>(p, "meta")!;
        return { title: `[${lang}] ${meta.title}`, description: `[${lang}] ${meta.description}` };
      }
      case "critique":
        return { score: 9, summary: "Konsekvent och lanseringsklar.", issues: [] };
      default:
        throw new Error(`FakeProvider: unknown purpose ${req.purpose}`);
    }
  }
}

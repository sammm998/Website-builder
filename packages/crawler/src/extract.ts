import { sourcePageSchema, type SourcePage, type Facts, type MediaRef } from "@redesign/schema";
import type { RawExtraction } from "./browser";
import { pathOf } from "./discovery";

const LOCAL_BUSINESS_TYPES =
  /LocalBusiness|Restaurant|Store|Dentist|Physician|Hotel|Bakery|CafeOrCoffeeShop|AutoRepair|BeautySalon|HairSalon|Plumber|Electrician|RealEstateAgent|LegalService|Attorney|AccountingService|HomeAndConstructionBusiness|GeneralContractor|RoofingContractor|MedicalBusiness|HealthAndBeautyBusiness|ProfessionalService|SportsActivityLocation|FoodEstablishment|Organization|Corporation/;

type JsonObject = Record<string, unknown>;

function flattenJsonLd(input: unknown[]): JsonObject[] {
  const out: JsonObject[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node && typeof node === "object") {
      const obj = node as JsonObject;
      out.push(obj);
      if (Array.isArray(obj["@graph"])) (obj["@graph"] as unknown[]).forEach(visit);
    }
  };
  input.forEach(visit);
  return out;
}

function typesOf(obj: JsonObject): string[] {
  const t = obj["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

function addressText(addr: unknown): string {
  if (typeof addr === "string") return addr;
  if (addr && typeof addr === "object") {
    const a = addr as JsonObject;
    return [a["streetAddress"], a["postalCode"], a["addressLocality"], a["addressCountry"]]
      .map((v) => (typeof v === "string" ? v : v && typeof v === "object" ? (v as JsonObject)["name"] : ""))
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .join(", ");
  }
  return "";
}

/** Facts only from evidence present on the page (links, <address>, declared JSON-LD). Never inferred. */
export function factsFrom(raw: RawExtraction): Facts {
  const base = (raw["facts"] ?? {}) as Partial<Facts>;
  const ld = flattenJsonLd((raw["jsonLd"] as unknown[]) ?? []);
  const org = ld.find((o) => typesOf(o).some((t) => LOCAL_BUSINESS_TYPES.test(t)));
  const phones = new Set(base.phones ?? []);
  const emails = new Set(base.emails ?? []);
  const addresses = new Set(base.addresses ?? []);
  const socials = new Set(base.socials ?? []);
  const openingHours: string[] = [];
  if (org) {
    if (typeof org["telephone"] === "string") phones.add(org["telephone"]);
    if (typeof org["email"] === "string") emails.add(org["email"].replace(/^mailto:/, ""));
    const addr = addressText(org["address"]);
    if (addr) addresses.add(addr);
    const sameAs = org["sameAs"];
    (Array.isArray(sameAs) ? sameAs : [sameAs]).forEach((s) => typeof s === "string" && socials.add(s));
    const oh = org["openingHours"];
    (Array.isArray(oh) ? oh : [oh]).forEach((s) => typeof s === "string" && openingHours.push(s));
  }
  const ogSite = ((raw["og"] as Record<string, string>) ?? {})["og:site_name"] ?? "";
  return {
    organizationName: (typeof org?.["name"] === "string" ? org["name"] : "") || ogSite,
    phones: [...phones].slice(0, 6),
    emails: [...emails].slice(0, 6),
    addresses: [...addresses].slice(0, 4),
    socials: [...socials].slice(0, 12),
    schemaTypes: [...new Set(ld.flatMap(typesOf))].slice(0, 12),
    openingHours,
  };
}

/** Validates and normalizes the in-page extraction into a SourcePage. */
export function toSourcePage(raw: RawExtraction, requestedUrl: string, logo: MediaRef | null): SourcePage {
  const url = typeof raw["url"] === "string" ? (raw["url"] as string) : requestedUrl;
  const result = sourcePageSchema.safeParse({
    version: 1,
    url,
    path: pathOf(requestedUrl),
    lang: raw["lang"],
    title: raw["title"],
    description: raw["description"],
    canonical: raw["canonical"],
    hreflang: raw["hreflang"],
    og: raw["og"],
    robots: raw["robots"],
    logo: logo ?? raw["logo"] ?? null,
    nav: raw["nav"],
    hero: raw["hero"],
    sections: raw["sections"],
    footer: raw["footer"],
    facts: factsFrom(raw),
    palette: raw["palette"],
    fonts: raw["fonts"],
    wordCount: raw["wordCount"],
    headings: raw["headings"],
    jsonLd: raw["jsonLd"],
  });
  if (!result.success) {
    throw new Error(`Could not normalize page content: ${result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return result.data;
}

/** Every media reference of a page in document order (hero, sections, footer, logo). */
export function pageMedia(page: SourcePage): MediaRef[] {
  const out: MediaRef[] = [];
  if (page.logo) out.push(page.logo);
  for (const section of [page.hero, ...page.sections, page.footer]) {
    for (const block of section.blocks) if (block.type === "media") out.push(block.media);
  }
  return out;
}

/** Applies cached media ids to every reference with a matching source URL. */
export function attachMediaIds(page: SourcePage, ids: ReadonlyMap<string, string>): SourcePage {
  const fix = (m: MediaRef): MediaRef => {
    const id = ids.get(m.src);
    return id ? { ...m, mediaId: id } : m;
  };
  const fixSection = (s: SourcePage["hero"]) => ({
    ...s,
    blocks: s.blocks.map((b) => (b.type === "media" ? { ...b, media: fix(b.media) } : b)),
  });
  return {
    ...page,
    logo: page.logo ? fix(page.logo) : null,
    hero: fixSection(page.hero),
    sections: page.sections.map(fixSection),
    footer: fixSection(page.footer),
  };
}

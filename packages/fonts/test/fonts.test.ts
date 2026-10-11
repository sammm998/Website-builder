import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FONT_IDS } from "@redesign/schema";
import { fontFaceCss, fontFiles, preloadFile } from "../src";
import { fontSource } from "../src/node";

describe("fonts", () => {
  it.each(FONT_IDS)("%s ships existing latin + latin-ext files", (id) => {
    const files = fontFiles(id);
    expect(files.some((f) => f.subset === "latin" && f.style === "normal")).toBe(true);
    expect(files.some((f) => f.subset === "latin-ext" && f.style === "normal")).toBe(true);
    for (const f of files) expect(existsSync(fontSource(id, f.file))).toBe(true);
    expect(fontFaceCss(id, "")).toContain("font-display:swap");
    expect(files.map((f) => f.file)).toContain(preloadFile(id));
  });
});

import { describe, expect, it } from "vitest";
import { decryptSetting, encryptSetting } from "../src/secrets";

describe("encrypted settings", () => {
  const env = { SESSION_SECRET: "s".repeat(40) };
  it("round-trips and never stores the plain value", () => {
    const stored = encryptSetting("sk-ant-api03-secret", env);
    expect(stored).not.toContain("secret");
    expect(decryptSetting(stored, env)).toBe("sk-ant-api03-secret");
    expect(encryptSetting("sk-ant-api03-secret", env)).not.toBe(stored);
  });
  it("returns null with another secret or tampered data", () => {
    const stored = encryptSetting("sk-ant-x", env);
    expect(decryptSetting(stored, { SESSION_SECRET: "other".repeat(10) })).toBeNull();
    expect(decryptSetting(`${stored.slice(0, -4)}AAAA`, env)).toBeNull();
    expect(decryptSetting("plain", env)).toBeNull();
  });
  it("falls back to DATABASE_URL so web and worker agree without SESSION_SECRET", () => {
    const a = { DATABASE_URL: "postgres://x" };
    expect(decryptSetting(encryptSetting("k", a), { DATABASE_URL: "postgres://x" })).toBe("k");
  });
});

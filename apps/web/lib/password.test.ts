import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const stored = await hashPassword("korrekt häst batteri");
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("korrekt häst batteri", stored)).toBe(true);
    expect(await verifyPassword("korrekt hast batteri", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("samma-lösen")).not.toBe(await hashPassword("samma-lösen"));
  });

  it("rejects malformed stored values", async () => {
    expect(await verifyPassword("x", "plain")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });

  it("enforces length", () => {
    expect(passwordProblem("short")).toBeTruthy();
    expect(passwordProblem("long enough")).toBeNull();
  });
});

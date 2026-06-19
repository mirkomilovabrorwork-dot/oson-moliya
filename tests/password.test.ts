import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  normalizeLoginName,
  isValidLoginName,
  isValidPassword,
} from "../src/lib/auth/password";

describe("password hashing", () => {
  it("verifies a correct password (roundtrip)", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different salt each time (no static hash)", async () => {
    const a = await hashPassword("samePassword123");
    const b = await hashPassword("samePassword123");
    expect(a).not.toBe(b);
    expect(await verifyPassword("samePassword123", a)).toBe(true);
    expect(await verifyPassword("samePassword123", b)).toBe(true);
  });

  it("returns false on malformed / empty stored value (never throws)", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "no-colon")).toBe(false);
    expect(await verifyPassword("x", "salt:")).toBe(false);
  });
});

describe("login name validation", () => {
  it("normalizes (trim + lowercase)", () => {
    expect(normalizeLoginName("  Sardor_01 ")).toBe("sardor_01");
  });

  it("accepts valid names, rejects invalid", () => {
    expect(isValidLoginName("sardor")).toBe(true);
    expect(isValidLoginName("Sardor_01")).toBe(true); // normalized first
    expect(isValidLoginName("ab")).toBe(false); // too short
    expect(isValidLoginName("a".repeat(21))).toBe(false); // too long
    expect(isValidLoginName("bad name")).toBe(false); // space
    expect(isValidLoginName("emoji✨")).toBe(false);
  });
});

describe("password validation", () => {
  it("requires at least 8 characters", () => {
    expect(isValidPassword("1234567")).toBe(false);
    expect(isValidPassword("12345678")).toBe(true);
  });
});

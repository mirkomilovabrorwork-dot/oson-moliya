import { describe, it, expect } from "vitest";
import { isUniqueCaptureIdViolation } from "../src/lib/services/transactions";

describe("isUniqueCaptureIdViolation — de-duplication branch selection", () => {
  it("recognizes a Prisma P2002 unique-constraint error", () => {
    expect(isUniqueCaptureIdViolation({ code: "P2002" })).toBe(true);
  });

  it("does not match a different Prisma error code", () => {
    expect(isUniqueCaptureIdViolation({ code: "P2025" })).toBe(false);
  });

  it("does not match a plain Error without a code", () => {
    expect(isUniqueCaptureIdViolation(new Error("boom"))).toBe(false);
  });

  it("does not match null/undefined/non-object values", () => {
    expect(isUniqueCaptureIdViolation(null)).toBe(false);
    expect(isUniqueCaptureIdViolation(undefined)).toBe(false);
    expect(isUniqueCaptureIdViolation("P2002")).toBe(false);
  });
});

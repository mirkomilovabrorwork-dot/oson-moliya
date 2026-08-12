import { describe, it, expect } from "vitest";
import { toAmountDigits, toAmountBigInt } from "../src/lib/money-input";

/**
 * REGRESSION GUARD for the 2026-08-12 silent-save bug.
 *
 * The debts payment modal checked the amount with one rule and SENT it with a
 * weaker one, so a grouped amount like "5,000,000" passed the check and was
 * then rejected by the API's ^[1-9]\d*$ guard. The user saw nothing save and no
 * error. These assertions pin the contract: whatever the user types, what goes
 * on the wire is digits-only and matches the server's rule.
 */

// Exactly the regex the API routes use to accept an amount.
const SERVER_RULE = /^[1-9]\d*$/;

describe("toAmountDigits — what the server will accept", () => {
  const grouped = [
    "5000000",           // already clean
    "5 000 000",         // app's own display format (plain spaces)
    "5 000 000", // non-breaking spaces (what formatMoney can emit)
    "5,000,000",         // comma grouping — the reported failure
    "5.000.000",         // dot grouping
    "5'000'000",         // apostrophe grouping
  ];

  for (const input of grouped) {
    it(`"${input}" → "5000000" and satisfies the server rule`, () => {
      const out = toAmountDigits(input);
      expect(out).toBe("5000000");
      expect(SERVER_RULE.test(out)).toBe(true);
    });
  }

  it("drops leading zeros so the server rule still matches", () => {
    expect(toAmountDigits("007")).toBe("7");
    expect(SERVER_RULE.test(toAmountDigits("007"))).toBe(true);
  });

  // REGRESSION GUARD: collapsing "0" to "" made it impossible to rename a
  // zero-balance account (the default "Naqd" one included) — the PATCH sent an
  // empty amount and 422'd. Zero is a legal OPENING BALANCE; it is the debt /
  // payment endpoints (^[1-9]\d*$) that reject it, visibly, on the server.
  it("keeps zero as a real value — it is a legal opening balance", () => {
    expect(toAmountDigits("0")).toBe("0");
    expect(toAmountDigits("000")).toBe("0");
    expect(toAmountBigInt("0")).toBe(0n);
    // and it must still be refused where zero is not a valid amount
    expect(SERVER_RULE.test("0")).toBe(false);
  });

  // REGRESSION GUARD for a defect introduced by the FIRST version of this
  // helper and caught in blind review: stripping every non-digit silently
  // rewrote the user's number. A loud server error is correct here; a wrong
  // saved amount is not.
  it("REFUSES a negative amount instead of flipping its sign", () => {
    expect(toAmountDigits("-500000")).toBe("");
    expect(toAmountDigits("-500 000")).toBe("");
    expect(toAmountDigits("−500000")).toBe(""); // unicode minus
    expect(toAmountBigInt("-500000")).toBe(0n);
  });

  it("REFUSES a decimal instead of multiplying it by 100", () => {
    expect(toAmountDigits("12.50")).toBe("");
    expect(toAmountDigits("12,50")).toBe("");
    expect(toAmountDigits("0.5")).toBe("");
    expect(toAmountDigits("1234.5")).toBe("");
  });

  it("still accepts unambiguous thousands grouping", () => {
    expect(toAmountDigits("5.000.000")).toBe("5000000");
    expect(toAmountDigits("5,000,000")).toBe("5000000");
    expect(toAmountDigits("12,345")).toBe("12345");
  });

  it("returns empty string when there is no usable amount", () => {
    expect(toAmountDigits("")).toBe("");
    expect(toAmountDigits("   ")).toBe("");
    expect(toAmountDigits("so'm")).toBe("");
    expect(toAmountDigits("5 000 000 so'm")).toBe(""); // letters → server error, not a guess
    expect(toAmountDigits(null)).toBe("");
    expect(toAmountDigits(undefined)).toBe("");
  });

  it("never invents a positive amount from unreadable input", () => {
    // Anything it does return for a POSITIVE amount satisfies the server rule;
    // unreadable input returns "" and zero returns "0" — both are refused by
    // the amount endpoints, visibly, rather than becoming a wrong number.
    const messy = ["12 345", "1,2,3", "0012", "  9 ", "abc42def", "-500", "5.5"];
    for (const m of messy) {
      const out = toAmountDigits(m);
      if (out !== "" && out !== "0") expect(SERVER_RULE.test(out)).toBe(true);
    }
    expect(toAmountDigits("-500")).toBe("");
    expect(toAmountDigits("5.5")).toBe("");
    expect(toAmountDigits("abc42def")).toBe("");
  });
});

describe("toAmountBigInt — client-side comparison", () => {
  it("parses grouped input to the same number regardless of separator", () => {
    expect(toAmountBigInt("5,000,000")).toBe(5000000n);
    expect(toAmountBigInt("5 000 000")).toBe(5000000n);
    expect(toAmountBigInt("5000000")).toBe(5000000n);
  });

  it("returns 0n for unusable input instead of throwing", () => {
    expect(toAmountBigInt("")).toBe(0n);
    expect(toAmountBigInt("so'm")).toBe(0n);
    expect(toAmountBigInt(undefined)).toBe(0n);
    expect(toAmountBigInt("0")).toBe(0n);
  });

  it("the validate-path and the send-path agree (the actual defect)", () => {
    // Before the fix these two disagreed: the check used \D, the send used \s.
    for (const input of ["5,000,000", "5 000 000", "5.000.000"]) {
      const validated = toAmountBigInt(input);
      const sent = toAmountDigits(input);
      expect(sent).toBe(validated.toString());
    }
  });
});

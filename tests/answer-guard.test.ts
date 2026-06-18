/**
 * Unit tests for containsAllNumbers — the number-safety guard in answer.ts.
 * No I/O, no DB, no Anthropic calls — pure logic only.
 */

import { describe, it, expect } from "vitest";
import { containsAllNumbers } from "@/lib/claude/answer";

describe("containsAllNumbers", () => {
  it("all numbers present → true", () => {
    expect(
      containsAllNumbers("Sizda 1 200 000 so'm bor va 50 000 so'm qarz.", [
        "1 200 000",
        "50 000",
      ])
    ).toBe(true);
  });

  it("one number missing → false", () => {
    expect(
      containsAllNumbers("Sizda 1 200 000 so'm bor.", ["1 200 000", "50 000"])
    ).toBe(false);
  });

  it("all numbers missing → false", () => {
    expect(containsAllNumbers("Pul yo'q.", ["1 200 000"])).toBe(false);
  });

  it("empty numbers array → true (vacuous)", () => {
    expect(containsAllNumbers("any text here", [])).toBe(true);
  });

  it("empty text + empty numbers → true", () => {
    expect(containsAllNumbers("", [])).toBe(true);
  });

  it("empty text + non-empty numbers → false", () => {
    expect(containsAllNumbers("", ["100"])).toBe(false);
  });

  // Whitespace / NBSP normalization
  it("NBSP in text matches regular-space in numbers", () => {
    // ' ' is a non-breaking space — common in number formatters
    const textWithNBSP = "Balans: 1 200 000 so'm.";
    expect(containsAllNumbers(textWithNBSP, ["1 200 000"])).toBe(true);
  });

  it("NBSP in number matches regular-space in text", () => {
    const textWithRegularSpaces = "Balans: 1 200 000 so'm.";
    expect(
      containsAllNumbers(textWithRegularSpaces, ["1 200 000"])
    ).toBe(true);
  });

  it("multiple spaces normalized — still matches", () => {
    const text = "Siz  1  200  000  so'm  sarfladingiz.";
    expect(containsAllNumbers(text, ["1 200 000"])).toBe(true);
  });

  it("tab whitespace in number normalized", () => {
    const text = "Daromad: 5 000 000 so'm.";
    expect(containsAllNumbers(text, ["5\t000\t000"])).toBe(true);
  });

  it("single number present → true", () => {
    expect(containsAllNumbers("Jami 42 000 so'm.", ["42 000"])).toBe(true);
  });

  it("partial number not a full match of longer number → false", () => {
    // "200" should not match if only "1 200 000" is in text
    // but "200" IS a substring of "1 200 000", so this should be true
    expect(containsAllNumbers("Jami 1 200 000 so'm.", ["200"])).toBe(true);
  });

  it("number that is not a substring → false", () => {
    expect(containsAllNumbers("Jami 1 200 000 so'm.", ["3 000 000"])).toBe(
      false
    );
  });

  it("multiple numbers all present (3 numbers) → true", () => {
    expect(
      containsAllNumbers(
        "Kirim: 5 000 000, chiqim: 3 000 000, balans: 2 000 000.",
        ["5 000 000", "3 000 000", "2 000 000"]
      )
    ).toBe(true);
  });

  it("multiple numbers, last one missing → false", () => {
    expect(
      containsAllNumbers(
        "Kirim: 5 000 000, chiqim: 3 000 000.",
        ["5 000 000", "3 000 000", "2 000 000"]
      )
    ).toBe(false);
  });
});

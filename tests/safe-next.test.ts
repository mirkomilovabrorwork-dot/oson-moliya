import { describe, it, expect } from "vitest";
import { safeNextPath } from "../src/lib/http/safe-next";

describe("safeNextPath", () => {
  it("accepts a plain internal path", () => {
    expect(safeNextPath("/capture")).toBe("/capture");
  });

  it("rejects a backslash payload that the URL parser treats as //", () => {
    expect(safeNextPath("/" + String.fromCharCode(92) + "evil.com")).toBeUndefined();
  });

  it("rejects a protocol-relative //host payload", () => {
    expect(safeNextPath("//evil.com")).toBeUndefined();
  });

  it("rejects an absolute URL to another origin", () => {
    expect(safeNextPath("https://evil.com")).toBeUndefined();
  });

  it("rejects a percent-encoded CRLF payload", () => {
    expect(safeNextPath("/x%0d%0a")).toBeUndefined();
  });

  it("rejects a backslash variant deeper in the path", () => {
    expect(safeNextPath("/a/b" + String.fromCharCode(92) + "evil.com")).toBeUndefined();
  });

  it("rejects non-string input", () => {
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath(42)).toBeUndefined();
  });
});

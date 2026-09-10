import { describe, it, expect } from "vitest";
import { deriveTxAmountFields } from "../src/lib/currency";
import type { Rates } from "../src/lib/rates";

const rates: Rates = { USD: 12800, EUR: 13800, RUB: 150 };

describe("deriveTxAmountFields — receipt extraction shape", () => {
  it("a UZS result leaves originalCurrency/originalAmount null", () => {
    const fields = deriveTxAmountFields(45000, "UZS", rates);
    expect(fields.amountUzs).toBe(45000n);
    expect(fields.originalCurrency).toBeNull();
    expect(fields.originalAmount).toBeNull();
  });

  it("a missing/null currency is treated as UZS (no conversion)", () => {
    const fields = deriveTxAmountFields(20000, null, rates);
    expect(fields.amountUzs).toBe(20000n);
    expect(fields.originalCurrency).toBeNull();
    expect(fields.originalAmount).toBeNull();
  });

  it("a USD result keeps the original amount+currency and converts at the live rate", () => {
    const fields = deriveTxAmountFields(50, "USD", rates);
    expect(fields.originalCurrency).toBe("USD");
    expect(fields.originalAmount).toBe(50n);
    expect(fields.amountUzs).toBe(640000n); // 50 * 12800
  });

  it("the same $50 receipt and a $50 voice entry convert to the identical so'm figure", () => {
    const fromReceipt = deriveTxAmountFields(50, "USD", rates);
    const fromVoice = deriveTxAmountFields(50, "usd", rates); // lower-case, as brain intents may send
    expect(fromReceipt.amountUzs).toBe(fromVoice.amountUzs);
  });

  it("an unrecognized foreign currency code refuses to invent a rate", () => {
    const fields = deriveTxAmountFields(100, "GBP", rates);
    expect(fields.originalCurrency).toBe("GBP");
    expect(fields.originalAmount).toBe(100n);
    expect(fields.amountUzs).toBeNull();
  });
});

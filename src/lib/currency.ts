/**
 * Pure currency conversion helpers — no I/O.
 *
 * Base unit: UZS (stored as BigInt amountUzs).
 * All conversions use the rates object from getRates() in rates.ts.
 *
 * UZS display MUST be byte-identical to the current formatAmount() in
 * src/lib/telegram/reply.ts:  "1 234 567 so'm"  (space-grouped, "so'm" suffix,
 * "−" U+2212 for negatives, "сум" in Russian).
 */

import type { DisplayCurrency, Rates } from "./rates";

/** Convert a UZS BigInt amount to the given display currency as a float. */
export function convertFromUzs(
  amountUzs: bigint,
  currency: DisplayCurrency,
  rates: Rates
): number {
  if (currency === "UZS") return Number(amountUzs);
  const rate = rates[currency as keyof Rates];
  if (!rate || rate <= 0) return Number(amountUzs);
  return Number(amountUzs) / rate;
}

/**
 * Per-transaction display helper.
 *
 * Always shows the transaction in its OWN currency:
 *   - If tx.originalCurrency is set (a foreign row), format using originalAmount + that
 *     currency's symbol (e.g. "€2.01", "₽5 000", "$100.00").
 *   - Otherwise (a plain UZS row), format amountUzs as so'm — identical to formatMoney UZS.
 *
 * The displayCurrency parameter is ignored here — rows always show their own currency.
 * Negative values: leading "−" (U+2212).
 */
export function formatTxMoney(
  tx: {
    amountUzs: bigint;
    originalCurrency?: string | null;
    originalAmount?: bigint | null;
  },
  _displayCurrency: DisplayCurrency,
  _rates: Rates,
  lang: string
): string {
  if (tx.originalCurrency && tx.originalAmount != null) {
    // Foreign row — show in original currency
    const oc = tx.originalCurrency.toUpperCase();
    const amt = tx.originalAmount < 0n ? -tx.originalAmount : tx.originalAmount;
    const negative = tx.originalAmount < 0n;
    const sign = negative ? "−" : "";
    if (oc === "USD" || oc === "EUR") {
      const symbol = oc === "USD" ? "$" : "€";
      const n = Number(amt);
      const formatted = n.toFixed(2);
      const [intPart, decPart] = formatted.split(".");
      if (lang === "ru") {
        const groupedInt = spaceGroup(parseInt(intPart, 10));
        return sign + groupedInt + "," + decPart + " " + symbol;
      }
      const usInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return sign + symbol + usInt + "." + decPart;
    }
    if (oc === "RUB") {
      const rounded = Math.round(Number(amt));
      const grouped = spaceGroup(rounded);
      if (lang === "ru") return sign + grouped + " ₽";
      return sign + "₽" + grouped;
    }
    // Generic fallback: number + currency code
    return sign + spaceGroup(Number(amt)) + " " + oc;
  }
  // Plain UZS row — format as so'm
  return formatMoney(tx.amountUzs, "UZS", _rates, lang);
}

/** Convert a foreign-currency float amount to UZS BigInt. */
export function convertToUzs(
  amount: number,
  currency: DisplayCurrency,
  rates: Rates
): bigint {
  if (currency === "UZS") return BigInt(Math.round(amount));
  const rate = rates[currency as keyof Rates];
  if (!rate || rate <= 0) return BigInt(Math.round(amount));
  return BigInt(Math.round(amount * rate));
}

/** Space-group an integer string (e.g. 1234567 → "1 234 567"). */
function spaceGroup(n: number): string {
  const parts: string[] = [];
  let rem = Math.abs(Math.round(n));
  if (rem === 0) {
    return "0";
  }
  while (rem >= 1000) {
    parts.unshift(String(rem % 1000).padStart(3, "0"));
    rem = Math.floor(rem / 1000);
  }
  parts.unshift(String(rem));
  return parts.join(" ");
}

/**
 * Format an amountUzs value for display in the given currency.
 *
 * UZS output: "1 234 567 so'm"  (identical to formatAmount() in reply.ts)
 *             Russian: "1 234 567 сум"
 * USD: "$1,234.56" (en/uz) / "1 234,56 $" (ru)
 * EUR: "€1,234.56" (en/uz) / "1 234,56 €" (ru)
 * RUB: "₽1,234" (en/uz) / "1 234 ₽" (ru) — rubles shown without decimals
 *
 * Negative values: leading "−" (U+2212).
 */
export function formatMoney(
  amountUzs: bigint,
  currency: DisplayCurrency,
  rates: Rates,
  lang: string
): string {
  const negative = amountUzs < 0n;
  const sign = negative ? "−" : "";

  if (currency === "UZS") {
    // Byte-identical to formatAmount() in src/lib/telegram/reply.ts
    const parts: string[] = [];
    let n = negative ? -amountUzs : amountUzs;
    while (n >= 1000n) {
      parts.unshift(String(n % 1000n).padStart(3, "0"));
      n = n / 1000n;
    }
    parts.unshift(String(n));
    const label = lang === "ru" ? "сум" : "so'm";
    return sign + parts.join(" ") + " " + label;
  }

  const converted = convertFromUzs(negative ? -amountUzs : amountUzs, currency, rates);

  if (currency === "USD" || currency === "EUR") {
    const symbol = currency === "USD" ? "$" : "€";
    const formatted = converted.toFixed(2);
    // Split integer and decimal parts for grouping
    const [intPart, decPart] = formatted.split(".");
    const groupedInt = spaceGroup(parseInt(intPart, 10));

    if (lang === "ru") {
      // Russian style: "1 234,56 $"
      return sign + groupedInt + "," + decPart + " " + symbol;
    }
    // English/Uzbek style: "$1,234.56" — use comma as thousands sep for INT, dot as decimal
    // Rebuild with comma thousands separator for US style
    const usInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return sign + symbol + usInt + "." + decPart;
  }

  if (currency === "RUB") {
    const rounded = Math.round(converted);
    const grouped = spaceGroup(rounded);
    if (lang === "ru") {
      return sign + grouped + " ₽";
    }
    return sign + "₽" + grouped;
  }

  // Fallback (should not reach)
  return sign + spaceGroup(converted) + " " + currency;
}

/**
 * Format a native amount in its own currency symbol (for per-currency overview rows).
 *
 * nativeAmount: the amount already in `currency` units (not UZS).
 * For UZS, pass the amountUzs directly.
 */
export function formatNative(
  nativeAmount: number,
  currency: string,
  lang: string
): string {
  const oc = currency.toUpperCase();
  const abs = Math.abs(nativeAmount);
  const sign = nativeAmount < 0 ? "−" : "";

  if (oc === "USD" || oc === "EUR") {
    const symbol = oc === "USD" ? "$" : "€";
    const formatted = abs.toFixed(2);
    const [intPart, decPart] = formatted.split(".");
    if (lang === "ru") {
      const groupedInt = spaceGroup(parseInt(intPart, 10));
      return sign + groupedInt + "," + decPart + " " + symbol;
    }
    const usInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return sign + symbol + usInt + "." + decPart;
  }
  if (oc === "RUB") {
    const rounded = Math.round(abs);
    const grouped = spaceGroup(rounded);
    if (lang === "ru") return sign + grouped + " ₽";
    return sign + "₽" + grouped;
  }
  // UZS
  if (oc === "UZS") {
    const parts: string[] = [];
    let n = Math.round(abs);
    if (n === 0) {
      const label = lang === "ru" ? "сум" : "so'm";
      return sign + "0 " + label;
    }
    while (n >= 1000) {
      parts.unshift(String(n % 1000).padStart(3, "0"));
      n = Math.floor(n / 1000);
    }
    parts.unshift(String(n));
    const label = lang === "ru" ? "сум" : "so'm";
    return sign + parts.join(" ") + " " + label;
  }
  return sign + spaceGroup(abs) + " " + oc;
}

/**
 * Convert a native amount in currency C to the main/base currency.
 *
 * Math:
 *   C → UZS:   nativeAmount * rates[C]
 *   UZS → main: mainCurrency === "UZS" ? same; else divide by rates[main]
 *
 * For UZS amounts, pass currency = "UZS" and nativeAmount = amountUzs in number form.
 */
export function convertNativeToMain(
  nativeAmount: number,
  currency: string,
  mainCurrency: DisplayCurrency,
  rates: Rates
): number {
  const oc = currency.toUpperCase();

  // Step 1: convert to UZS
  let amountUzs: number;
  if (oc === "UZS") {
    amountUzs = nativeAmount;
  } else {
    const rate = rates[oc as keyof Rates];
    amountUzs = rate && rate > 0 ? nativeAmount * rate : nativeAmount;
  }

  // Step 2: convert UZS to main
  if (mainCurrency === "UZS") return amountUzs;
  const mainRate = rates[mainCurrency as keyof Rates];
  if (!mainRate || mainRate <= 0) return amountUzs;
  return amountUzs / mainRate;
}

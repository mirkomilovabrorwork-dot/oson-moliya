/**
 * CBU (Central Bank of Uzbekistan) live exchange rates.
 * Server-only module — never import in client components.
 *
 * All rates are expressed as: how many UZS = 1 unit of foreign currency.
 * Example: USD rate 12800 means 1 USD = 12800 UZS.
 *
 * The cache TTL is ~6 hours. If the fetch fails for any reason, a hardcoded
 * fallback is returned so the dashboard never breaks.
 */

export type DisplayCurrency = "UZS" | "USD" | "EUR" | "RUB" | "ORIGINAL";

export interface Rates {
  USD: number;
  EUR: number;
  RUB: number;
}

// HARDCODED FALLBACK — approximate rates for June 2026.
// These are clearly marked and only used when the CBU API is unreachable.
const FALLBACK_RATES: Rates = {
  USD: 12800, // 1 USD ≈ 12 800 UZS (2026 approximation)
  EUR: 13800, // 1 EUR ≈ 13 800 UZS (2026 approximation)
  RUB: 150,   // 1 RUB ≈ 150 UZS   (2026 approximation)
};

const CBU_URL =
  process.env.CBU_URL ??
  "https://cbu.uz/uz/arkhiv-kursov-valyut/json/";

// In-memory cache
let cachedRates: Rates | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CbuEntry {
  Ccy: string;
  Rate: string;
  [key: string]: unknown;
}

/**
 * Returns live CBU rates (UZS per 1 unit of foreign currency).
 * Never throws — falls back to FALLBACK_RATES on any error.
 */
export async function getRates(): Promise<Rates> {
  const now = Date.now();
  if (cachedRates && now - cacheTime < CACHE_TTL_MS) {
    return cachedRates;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(CBU_URL, { signal: controller.signal, next: { revalidate: 21600 } });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`CBU HTTP ${res.status}`);

    const data = (await res.json()) as CbuEntry[];
    if (!Array.isArray(data)) throw new Error("CBU unexpected response shape");

    const map = new Map<string, number>();
    for (const entry of data) {
      const rate = parseFloat(entry.Rate);
      if (entry.Ccy && !isNaN(rate) && rate > 0) {
        map.set(entry.Ccy.toUpperCase(), rate);
      }
    }

    const usd = map.get("USD");
    const eur = map.get("EUR");
    const rub = map.get("RUB");

    if (!usd || !eur || !rub) {
      console.warn("[rates] CBU response missing USD/EUR/RUB — using fallback");
      return FALLBACK_RATES;
    }

    cachedRates = { USD: usd, EUR: eur, RUB: rub };
    cacheTime = now;
    return cachedRates;
  } catch (err) {
    console.warn("[rates] Failed to fetch CBU rates — using fallback:", err);
    return FALLBACK_RATES;
  }
}

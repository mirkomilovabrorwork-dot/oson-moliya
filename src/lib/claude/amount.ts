/**
 * Deterministic amount parser for Uzbek/Russian/English number words + multipliers.
 * Used as a fallback when Claude returns amount=null.
 *
 * Supported formats:
 *   "500 ming"       → 500000n
 *   "500ming"        → 500000n
 *   "2 mln"          → 2000000n
 *   "2,5 mln"        → 2500000n
 *   "2.5 mln"        → 2500000n
 *   "500 000"        → 500000n (spaced thousands)
 *   "yarim million"  → 500000n
 *   "1.5 million"    → 1500000n
 *   "300k"           → 300000n
 *   "1 mlrd"         → 1000000000n
 *   "3 000 000"      → 3000000n
 *   "2 млн"          → 2000000n
 *   "500 тысяч"      → 500000n
 */

interface MultiplierEntry {
  words: string[];
  mult: number;
}

const MULTIPLIER_TABLE: MultiplierEntry[] = [
  {
    words: ["mlrd", "milliard", "mlrd", "миллиард", "млрд"],
    mult: 1_000_000_000,
  },
  {
    words: ["million", "mln", "million", "миллион", "млн"],
    mult: 1_000_000,
  },
  {
    words: ["ming", "min", "тысяч", "тысяча", "тыс", "мин"],
    mult: 1_000,
  },
  {
    words: ["k"],
    mult: 1_000,
  },
];

function normalizeText(s: string): string {
  return s.toLowerCase().trim();
}

function removeSpaceThousands(s: string): string {
  // "500 000" → "500000", "3 000 000" → "3000000"
  // Apply repeatedly until no more replacements occur
  let prev = s;
  let result = s.replace(/(\d) (\d{3})(?!\d)/g, "$1$2");
  while (result !== prev) {
    prev = result;
    result = result.replace(/(\d) (\d{3})(?!\d)/g, "$1$2");
  }
  return result;
}

function parseNumber(s: string): number | null {
  // Normalize: replace comma decimal with dot, remove spaces
  const clean = s.replace(/,/g, ".").replace(/\s+/g, "");
  if (!clean) return null;
  const n = parseFloat(clean);
  if (isNaN(n) || n <= 0) return null;
  return n;
}

/**
 * Parses a text string and returns a BigInt whole-so'm amount, or null if not found.
 */
export function parseAmountUzs(text: string): bigint | null {
  if (!text || typeof text !== "string") return null;

  const t = normalizeText(text);

  // ---- Step 1: Handle "yarim" (half) ----
  // "yarim million" → 0.5 × mult
  const yarimMatch = t.match(/yarim\s*(\S+)/);
  if (yarimMatch) {
    const word = yarimMatch[1];
    for (const { words, mult } of MULTIPLIER_TABLE) {
      if (words.includes(word)) {
        return BigInt(Math.round(0.5 * mult));
      }
    }
  }

  // ---- Step 2: Try to find "number + multiplier_word" pattern ----
  // We extract all (number_token, word_token) adjacent pairs from the text
  // Tokenise: split by whitespace, but also handle concatenated like "500ming"
  const tokens = tokenize(t);

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Check if this token is a number-word concatenation: "500ming", "300k"
    const concatMatch = tok.match(/^([\d][,\d\.]*)(k|ming|min|mln|mlrd|million|мин)$/i);
    if (concatMatch) {
      const numPart = concatMatch[1];
      const wordPart = concatMatch[2].toLowerCase();
      const num = parseNumber(numPart);
      if (num !== null) {
        for (const { words, mult } of MULTIPLIER_TABLE) {
          if (words.includes(wordPart)) {
            return BigInt(Math.round(num * mult));
          }
        }
      }
    }

    // Check if this token is a multiplier word, and previous token is a number
    for (const { words, mult } of MULTIPLIER_TABLE) {
      if (words.includes(tok)) {
        // Look for a number token before this word
        if (i > 0) {
          const prevTok = tokens[i - 1];
          const num = parseNumber(prevTok);
          if (num !== null) {
            return BigInt(Math.round(num * mult));
          }
        }
        // Also check if next token is "сум" or similar (ignore) and previous is number
        // Pattern like "2,5 млн" where tokens are ["2,5", "млн"]
        break;
      }
    }
  }

  // ---- Step 3: Spaced thousands format "500 000" or "3 000 000" ----
  // Match patterns like "500 000" or "3 000 000" (groups of 3 digits separated by spaces)
  const spacedPattern = /\b(\d{1,3}(?: \d{3})+)\b/g;
  let bestSpaced: bigint | null = null;
  let spacedMatchArr: RegExpExecArray | null;
  while ((spacedMatchArr = spacedPattern.exec(t)) !== null) {
    const stripped = spacedMatchArr[1].replace(/ /g, "");
    const n = parseInt(stripped, 10);
    if (!isNaN(n) && n > 0) {
      if (bestSpaced === null || BigInt(n) > bestSpaced) {
        bestSpaced = BigInt(n);
      }
    }
  }
  if (bestSpaced !== null) return bestSpaced;

  // ---- Step 4: Plain integer (≥2 digits) ----
  const plainMatch = t.match(/\b(\d{2,})\b/);
  if (plainMatch) {
    const n = parseInt(plainMatch[1], 10);
    if (!isNaN(n) && n > 0) return BigInt(n);
  }

  return null;
}

/**
 * Tokenize a string into meaningful tokens, keeping decimal numbers together.
 * "sotuv 2,5 mln chiqim" → ["sotuv", "2,5", "mln", "chiqim"]
 * "500ming" → ["500ming"] (preserved as-is for concat detection)
 */
function tokenize(text: string): string[] {
  // Split on whitespace, preserving each chunk
  return text.split(/\s+/).filter((s) => s.length > 0);
}

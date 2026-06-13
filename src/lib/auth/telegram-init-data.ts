import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validates Telegram WebApp initData per Telegram's official algorithm.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Returns the parsed user object on success, throws on invalid/expired data.
 */
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export class TelegramInitDataError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_HASH" | "EXPIRED" | "MISSING_HASH" | "MISSING_USER"
  ) {
    super(message);
    this.name = "TelegramInitDataError";
  }
}

const MAX_AGE_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Validates the raw initData string from window.Telegram.WebApp.initData.
 *
 * Algorithm:
 *   1. Parse as URLSearchParams, extract `hash`.
 *   2. data_check_string = remaining pairs "key=value" sorted ascending joined by "\n".
 *   3. secret_key = HMAC-SHA256(key="WebAppData", msg=botToken)
 *   4. computed = HMAC-SHA256(key=secret_key, msg=data_check_string) hex
 *   5. Timing-safe compare computed === hash; reject if auth_date > 24h old.
 */
export function validateTelegramInitData(
  rawInitData: string,
  botToken: string
): TelegramUser {
  const params = new URLSearchParams(rawInitData);

  const hash = params.get("hash");
  if (!hash) {
    throw new TelegramInitDataError("Missing hash in initData", "MISSING_HASH");
  }

  // Build data_check_string: all params except hash, sorted by key, joined by \n
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") {
      pairs.push(`${key}=${value}`);
    }
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  // Compute secret_key = HMAC-SHA256(key="WebAppData", msg=botToken)
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();

  // Compute HMAC-SHA256(key=secretKey, msg=dataCheckString) hex
  const computedHex = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  // Timing-safe compare
  const computedBuf = Buffer.from(computedHex, "hex");
  const hashBuf = Buffer.from(hash, "hex");

  let hashValid = false;
  if (computedBuf.length === hashBuf.length) {
    try {
      hashValid = timingSafeEqual(computedBuf, hashBuf);
    } catch {
      hashValid = false;
    }
  }

  if (!hashValid) {
    throw new TelegramInitDataError("initData HMAC mismatch", "INVALID_HASH");
  }

  // Replay guard: auth_date must be within 24h
  const authDateStr = params.get("auth_date");
  if (authDateStr) {
    const authDate = parseInt(authDateStr, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - authDate > MAX_AGE_SECONDS) {
      throw new TelegramInitDataError(
        "initData is older than 24 hours",
        "EXPIRED"
      );
    }
  }

  // Parse user JSON
  const userStr = params.get("user");
  if (!userStr) {
    throw new TelegramInitDataError("Missing user in initData", "MISSING_USER");
  }

  const user = JSON.parse(userStr) as TelegramUser;
  return user;
}

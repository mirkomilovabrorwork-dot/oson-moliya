import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  validateTelegramInitData,
  TelegramInitDataError,
} from "../src/lib/auth/telegram-init-data";

// ── Helpers to build a valid initData for a test token ──────────────────────

const TEST_BOT_TOKEN = "1234567890:ABCDEFabcdefABCDEF0123456789abcdef0";

function buildInitData(
  overrides: {
    user?: object;
    auth_date?: number;
    extra?: Record<string, string>;
    tamperHash?: boolean;
  } = {}
): string {
  const authDate =
    overrides.auth_date ?? Math.floor(Date.now() / 1000);

  const user = overrides.user ?? {
    id: 123456789,
    first_name: "Test",
    username: "testuser",
    language_code: "uz",
  };

  // Build the data_check_string pairs (all params except hash)
  const params: Record<string, string> = {
    auth_date: String(authDate),
    user: JSON.stringify(user),
    ...overrides.extra,
  };

  const pairs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const dataCheckString = pairs.join("\n");

  // Compute secret_key = HMAC-SHA256(key="WebAppData", msg=botToken)
  const secretKey = createHmac("sha256", "WebAppData")
    .update(TEST_BOT_TOKEN)
    .digest();

  // Compute hash = HMAC-SHA256(key=secretKey, msg=dataCheckString)
  let hash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (overrides.tamperHash) {
    // flip last char to produce an invalid hash
    hash = hash.slice(0, -1) + (hash.endsWith("a") ? "b" : "a");
  }

  // Build URLSearchParams with hash appended
  const sp = new URLSearchParams(params);
  sp.set("hash", hash);
  return sp.toString();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("validateTelegramInitData", () => {
  it("accepts a valid initData sample", () => {
    const raw = buildInitData();
    const user = validateTelegramInitData(raw, TEST_BOT_TOKEN);
    expect(user.id).toBe(123456789);
    expect(user.first_name).toBe("Test");
    expect(user.username).toBe("testuser");
  });

  it("rejects a tampered hash (INVALID_HASH)", () => {
    const raw = buildInitData({ tamperHash: true });
    expect(() => validateTelegramInitData(raw, TEST_BOT_TOKEN)).toThrow(
      TelegramInitDataError
    );
    try {
      validateTelegramInitData(raw, TEST_BOT_TOKEN);
    } catch (err) {
      expect(err instanceof TelegramInitDataError && err.code).toBe(
        "INVALID_HASH"
      );
    }
  });

  it("rejects initData validated against a different bot token (INVALID_HASH)", () => {
    const raw = buildInitData();
    expect(() =>
      validateTelegramInitData(raw, "9999999999:wrongtokenwrongtokenwrongtoken00")
    ).toThrow(TelegramInitDataError);
  });

  it("rejects expired initData (auth_date older than 24h) (EXPIRED)", () => {
    const yesterday = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
    const raw = buildInitData({ auth_date: yesterday });
    try {
      validateTelegramInitData(raw, TEST_BOT_TOKEN);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err instanceof TelegramInitDataError).toBe(true);
      if (err instanceof TelegramInitDataError) {
        expect(err.code).toBe("EXPIRED");
      }
    }
  });

  it("rejects initData with no hash (MISSING_HASH)", () => {
    // Build without hash
    const raw = "auth_date=1234567890&user=%7B%22id%22%3A1%7D";
    try {
      validateTelegramInitData(raw, TEST_BOT_TOKEN);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err instanceof TelegramInitDataError).toBe(true);
      if (err instanceof TelegramInitDataError) {
        expect(err.code).toBe("MISSING_HASH");
      }
    }
  });

  it("rejects initData with no user field (MISSING_USER)", () => {
    // Build a valid hash but without user param
    const authDate = Math.floor(Date.now() / 1000);
    const params: Record<string, string> = { auth_date: String(authDate) };
    const pairs = Object.entries(params).map(([k, v]) => `${k}=${v}`).sort();
    const dataCheckString = pairs.join("\n");
    const secretKey = createHmac("sha256", "WebAppData")
      .update(TEST_BOT_TOKEN)
      .digest();
    const hash = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const sp = new URLSearchParams(params);
    sp.set("hash", hash);
    const raw = sp.toString();

    try {
      validateTelegramInitData(raw, TEST_BOT_TOKEN);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err instanceof TelegramInitDataError).toBe(true);
      if (err instanceof TelegramInitDataError) {
        expect(err.code).toBe("MISSING_USER");
      }
    }
  });

  it("accepts initData with extra fields (query_id etc.)", () => {
    const raw = buildInitData({
      extra: { query_id: "AAHdF6IQAAAAAN0XohDhrOrc" },
    });
    const user = validateTelegramInitData(raw, TEST_BOT_TOKEN);
    expect(user.id).toBe(123456789);
  });
});

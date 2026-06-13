import { issueMagicToken } from "../auth/token";
import { getEnv } from "../env";

/** Formats a BigInt so'm amount as a readable string (space-grouped, reliable on Vercel/Node) */
export function formatAmount(amount: bigint): string {
  const parts: string[] = [];
  let n = amount < 0n ? -amount : amount;
  while (n >= 1000n) {
    parts.unshift(String(n % 1000n).padStart(3, "0"));
    n = n / 1000n;
  }
  parts.unshift(String(n));
  return (amount < 0n ? "−" : "") + parts.join(" ") + " so'm";
}

type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; web_app: { url: string } };

/**
 * Build the Dashboard reply options.
 *
 * - In production (https APP_URL): uses a web_app button so the dashboard opens
 *   as a native Telegram Mini App (authenticated via initData, no magic-link needed).
 * - On localhost (http): sends the magic-link as plain text (Telegram rejects http URLs
 *   in inline buttons and doesn't allow web_app on non-https).
 */
export async function dashboardReplyOptions(
  userId: string
): Promise<{ extraText: string; reply_markup?: { inline_keyboard: InlineKeyboardButton[][] } }> {
  const env = getEnv();
  if (env.APP_URL.startsWith("https://")) {
    // web_app button: opens Mini App in-Telegram; auth happens via initData
    return {
      extraText: "",
      reply_markup: {
        inline_keyboard: [[{ text: "📊 Dashboard", web_app: { url: env.APP_URL } }]],
      },
    };
  }
  // Localhost fallback: magic-link as plain text
  const raw = await issueMagicToken(userId);
  const url = `${env.APP_URL}/api/auth/verify?token=${raw}`;
  return { extraText: `\n\n📊 Dashboard: ${url}` };
}

/** Format a localized confirmation string after logging a transaction */
export function formatConfirmation(params: {
  amount: bigint;
  type: "income" | "expense";
  categoryName?: string | null;
  date: string; // "today" | "yesterday" | "YYYY-MM-DD"
  language: string;
}): string {
  const { amount, type, categoryName, date, language } = params;
  const amountStr = formatAmount(amount);

  let dateLabel: string;
  if (date === "today") {
    dateLabel = language === "ru" ? "сегодня" : language === "en" ? "today" : "bugun";
  } else if (date === "yesterday") {
    dateLabel = language === "ru" ? "вчера" : language === "en" ? "yesterday" : "kecha";
  } else {
    dateLabel = date;
  }

  const typeLabel =
    type === "income"
      ? language === "ru"
        ? "доход"
        : language === "en"
        ? "income"
        : "kirim"
      : language === "ru"
      ? "расход"
      : language === "en"
      ? "expense"
      : "chiqim";

  const parts = [amountStr, typeLabel];
  if (categoryName) parts.push(categoryName);
  parts.push(dateLabel);

  if (language === "ru") {
    return `✅ Записано: ${parts.join(", ")}.`;
  } else if (language === "en") {
    return `✅ Logged: ${parts.join(", ")}.`;
  } else {
    return `✅ Yozildi: ${parts.join(", ")}.`;
  }
}

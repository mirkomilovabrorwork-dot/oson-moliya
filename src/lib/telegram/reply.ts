import { issueMagicToken } from "../auth/token";
import { getEnv } from "../env";

/** Formats a BigInt so'm amount as a readable string */
export function formatAmount(amount: bigint): string {
  return amount.toLocaleString("uz-UZ") + " so'm";
}

/**
 * Build the Dashboard magic-link reply options.
 * Telegram rejects `http://localhost` URLs in inline buttons, so in local/dev we
 * send the link as plain text; in production (https APP_URL) we use the nice button.
 */
export async function dashboardReplyOptions(
  userId: string
): Promise<{ extraText: string; reply_markup?: { inline_keyboard: { text: string; url: string }[][] } }> {
  const env = getEnv();
  const raw = await issueMagicToken(userId);
  const url = `${env.APP_URL}/api/auth/verify?token=${raw}`;
  if (env.APP_URL.startsWith("https://")) {
    return { extraText: "", reply_markup: { inline_keyboard: [[{ text: "📊 Dashboard", url }]] } };
  }
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

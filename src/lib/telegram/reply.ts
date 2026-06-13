import { issueMagicToken } from "../auth/token";
import { getEnv } from "../env";

/** Formats a BigInt so'm amount as a readable string */
export function formatAmount(amount: bigint): string {
  return amount.toLocaleString("uz-UZ") + " so'm";
}

/** Build the Dashboard inline keyboard button (issues a magic-link) */
export async function buildDashboardButton(userId: string) {
  const env = getEnv();
  const raw = await issueMagicToken(userId);
  const url = `${env.APP_URL}/api/auth/verify?token=${raw}`;
  return {
    inline_keyboard: [
      [{ text: "📊 Dashboard", url }],
    ],
  };
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

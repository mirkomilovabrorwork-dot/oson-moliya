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

export type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; web_app: { url: string } }
  | { text: string; callback_data: string };

/** Localized button label strings for inline keyboards */
export function getBotLabels(lang: string): {
  incomeBtn: string;
  expenseBtn: string;
  deleteBtn: string;
  confirmDeleteBtn: string;
  cancelBtn: string;
  deletedMsg: string;
  expiredMsg: string;
  notFoundMsg: string;
  cancelledMsg: string;
} {
  if (lang === "ru") {
    return {
      incomeBtn: "🟢 Доход",
      expenseBtn: "🔴 Расход",
      deleteBtn: "🗑 Удалить",
      confirmDeleteBtn: "✅ Да, удалить",
      cancelBtn: "Нет",
      deletedMsg: "🗑 Удалено.",
      expiredMsg: "Время вышло, напишите заново.",
      notFoundMsg: "Не найдено.",
      cancelledMsg: "Отменено.",
    };
  } else if (lang === "en") {
    return {
      incomeBtn: "🟢 Income",
      expenseBtn: "🔴 Expense",
      deleteBtn: "🗑 Delete",
      confirmDeleteBtn: "✅ Yes, delete",
      cancelBtn: "No",
      deletedMsg: "🗑 Deleted.",
      expiredMsg: "Expired, please write again.",
      notFoundMsg: "Not found.",
      cancelledMsg: "Cancelled.",
    };
  } else {
    return {
      incomeBtn: "🟢 Kirim",
      expenseBtn: "🔴 Chiqim",
      deleteBtn: "🗑 O'chirish",
      confirmDeleteBtn: "✅ Ha, o'chir",
      cancelBtn: "Yo'q",
      deletedMsg: "🗑 O'chirildi.",
      expiredMsg: "Muddati tugadi, qaytadan yozing.",
      notFoundMsg: "Topilmadi.",
      cancelledMsg: "Bekor qilindi.",
    };
  }
}

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
): Promise<{ extraText: string; reply_markup?: { inline_keyboard: InlineKeyboardButton[][] }; dashRows: InlineKeyboardButton[][] }> {
  const env = getEnv();
  if (env.APP_URL.startsWith("https://")) {
    // web_app button: opens Mini App in-Telegram; auth happens via initData
    const dashRows: InlineKeyboardButton[][] = [[{ text: "📊 Moliyachi", web_app: { url: env.APP_URL } }]];
    return {
      extraText: "",
      dashRows,
      reply_markup: { inline_keyboard: dashRows },
    };
  }
  // Localhost fallback: magic-link as plain text
  const raw = await issueMagicToken(userId);
  const url = `${env.APP_URL}/api/auth/verify?token=${raw}`;
  return { extraText: `\n\n📊 Moliyachi: ${url}`, dashRows: [] };
}

/** Format a localized budget overspend warning to append to a confirmation reply */
export function formatBudgetAlert(params: {
  categoryName: string;
  spentUzs: bigint;
  limitUzs: bigint;
  language: string;
}): string {
  const { categoryName, spentUzs, limitUzs, language } = params;
  const spent = formatAmount(spentUzs);
  const limit = formatAmount(limitUzs);

  if (language === "ru") {
    return `⚠️ Внимание: по категории "${categoryName}" в этом месяце потрачено ${spent} — превышен лимит ${limit}.`;
  } else if (language === "en") {
    return `⚠️ Heads up: you've spent ${spent} on "${categoryName}" this month — over your ${limit} limit.`;
  } else {
    return `⚠️ Eslatma: "${categoryName}" bo'yicha bu oy ${spent} sarfladingiz — ${limit} limitidan oshdi.`;
  }
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

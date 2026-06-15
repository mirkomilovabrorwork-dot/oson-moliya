import { Keyboard } from "grammy";
import { issueMagicToken } from "../auth/token";
import { getEnv } from "../env";

/** Formats a BigInt amount as a readable string (space-grouped, reliable on Vercel/Node).
 *  Pass `lang` to get the localized currency suffix (ru → "сум", others → "so'm"). */
export function formatAmount(amount: bigint, lang: string = "uz"): string {
  const parts: string[] = [];
  let n = amount < 0n ? -amount : amount;
  while (n >= 1000n) {
    parts.unshift(String(n % 1000n).padStart(3, "0"));
    n = n / 1000n;
  }
  parts.unshift(String(n));
  const suffix = lang === "ru" ? " сум" : " so'm";
  return (amount < 0n ? "−" : "") + parts.join(" ") + suffix;
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
  editBtn: string;
  confirmDeleteBtn: string;
  cancelBtn: string;
  deletedMsg: string;
  expiredMsg: string;
  notFoundMsg: string;
  cancelledMsg: string;
  otherCategoryBtn: string;
  typeCategoryPrompt: string;
  categoryExpiredMsg: string;
  // Error / edge-case messages
  botErrorMsg: string;
  rateLimitMsg: string;
  audioTooLongMsg: string;
  voiceDownloadErrMsg: string;
  voiceTranscribeErrMsg: string;
  photoTooLargeMsg: string;
  photoDownloadErrMsg: string;
  photoProcessErrMsg: string;
  receiptHeader: string;
  receiptNoAmountMsg: string;
  audioDownloadErrMsg: string;
  audioTranscribeErrMsg: string;
  // Edit-UI labels
  editAmountLabel: string;
  editFixWhatPrompt: string;
  editAmountPrompt: string;
} {
  if (lang === "ru") {
    return {
      incomeBtn: "🟢 Доход",
      expenseBtn: "🔴 Расход",
      deleteBtn: "🗑 Удалить",
      editBtn: "✏️ Изменить",
      confirmDeleteBtn: "✅ Да, удалить",
      cancelBtn: "Нет",
      deletedMsg: "🗑 Удалено.",
      expiredMsg: "Время вышло, напишите заново.",
      notFoundMsg: "Не найдено.",
      cancelledMsg: "Отменено.",
      otherCategoryBtn: "✏️ Другое",
      typeCategoryPrompt: "Напишите название категории (например: еда)",
      categoryExpiredMsg: "Время вышло, напишите заново.",
      botErrorMsg: "Извините, произошла ошибка. Пожалуйста, попробуйте ещё раз.",
      rateLimitMsg: "⏳ Подождите немного — слишком много запросов. Попробуйте через 10 минут.",
      audioTooLongMsg: "🎤 Аудио слишком длинное. Пожалуйста, отправьте запись короче 60 секунд или напишите сообщение.",
      voiceDownloadErrMsg: "Не удалось загрузить голосовое сообщение.",
      voiceTranscribeErrMsg: "Не удалось распознать голос. Пожалуйста, напишите сообщение или попробуйте ещё раз.",
      photoTooLargeMsg: "🖼 Фото слишком большое (более 5 МБ). Пожалуйста, отправьте фото меньшего размера.",
      photoDownloadErrMsg: "Не удалось загрузить фото. Попробуйте ещё раз.",
      photoProcessErrMsg: "Произошла ошибка при обработке фото. Пожалуйста, попробуйте ещё раз.",
      receiptHeader: "🧾 Прочитал чек:",
      receiptNoAmountMsg: "Не смог определить сумму из чека. Напишите вручную или пришлите более чёткое фото.",
      audioDownloadErrMsg: "Не удалось загрузить аудиофайл.",
      audioTranscribeErrMsg: "Не удалось распознать аудио. Напишите сообщение.",
      editAmountLabel: "💰 Сумма",
      editFixWhatPrompt: "Что исправить?",
      editAmountPrompt: "Напишите новую сумму (напр. 50 000):",
    };
  } else if (lang === "en") {
    return {
      incomeBtn: "🟢 Income",
      expenseBtn: "🔴 Expense",
      deleteBtn: "🗑 Delete",
      editBtn: "✏️ Edit",
      confirmDeleteBtn: "✅ Yes, delete",
      cancelBtn: "No",
      deletedMsg: "🗑 Deleted.",
      expiredMsg: "Expired, please write again.",
      notFoundMsg: "Not found.",
      cancelledMsg: "Cancelled.",
      otherCategoryBtn: "✏️ Other",
      typeCategoryPrompt: "Type the category name (e.g. food)",
      categoryExpiredMsg: "Expired, please write again.",
      botErrorMsg: "Sorry, something went wrong. Please try again.",
      rateLimitMsg: "⏳ Please wait — too many requests. Try again in 10 minutes.",
      audioTooLongMsg: "🎤 Audio is too long. Please send a voice message under 60 seconds or type a message.",
      voiceDownloadErrMsg: "Could not download the voice file.",
      voiceTranscribeErrMsg: "Could not transcribe the voice message. Please send a text message or try again.",
      photoTooLargeMsg: "🖼 Photo is too large (over 5 MB). Please send a smaller photo.",
      photoDownloadErrMsg: "Could not download photo. Please try again.",
      photoProcessErrMsg: "An error occurred while processing the photo. Please try again.",
      receiptHeader: "🧾 Read receipt:",
      receiptNoAmountMsg: "Could not read the total from the receipt. Please type it manually or send a clearer photo.",
      audioDownloadErrMsg: "Could not download the audio file.",
      audioTranscribeErrMsg: "Could not transcribe the audio. Please send a text message.",
      editAmountLabel: "💰 Amount",
      editFixWhatPrompt: "Fix what?",
      editAmountPrompt: "Write the new amount (e.g. 50 000):",
    };
  } else {
    return {
      incomeBtn: "🟢 Kirim",
      expenseBtn: "🔴 Chiqim",
      deleteBtn: "🗑 O'chirish",
      editBtn: "✏️ Tahrirlash",
      confirmDeleteBtn: "✅ Ha, o'chir",
      cancelBtn: "Yo'q",
      deletedMsg: "🗑 O'chirildi.",
      expiredMsg: "Muddati tugadi, qaytadan yozing.",
      notFoundMsg: "Topilmadi.",
      cancelledMsg: "Bekor qilindi.",
      otherCategoryBtn: "✏️ Boshqa",
      typeCategoryPrompt: "Kategoriya nomini yozing (masalan: ovqat)",
      categoryExpiredMsg: "Muddati tugadi, qaytadan yozing.",
      botErrorMsg: "Kechirasiz, xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.",
      rateLimitMsg: "⏳ Biroz kuting — so'rovlar juda ko'p. 10 daqiqadan so'ng qaytadan urinib ko'ring.",
      audioTooLongMsg: "🎤 Audio juda uzun. Iltimos, 60 soniyadan qisqaroq ovozli xabar yuboring yoki yozma xabar kiriting.",
      voiceDownloadErrMsg: "Ovozli faylni yuklab bo'lmadi.",
      voiceTranscribeErrMsg: "Ovozni tanib bo'lmadi. Iltimos, yozma xabar yuboring yoki qaytadan urinib ko'ring.",
      photoTooLargeMsg: "🖼 Rasm juda katta (5 MB dan oshiq). Iltimos, kichikroq rasm yuboring.",
      photoDownloadErrMsg: "Rasmni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
      photoProcessErrMsg: "Rasmni qayta ishlashda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.",
      receiptHeader: "🧾 Chekdan o'qidim:",
      receiptNoAmountMsg: "Chekdan summani aniqlay olmadim. Iltimos qo'lda yozing yoki aniqroq rasm yuboring.",
      audioDownloadErrMsg: "Audio faylni yuklab bo'lmadi.",
      audioTranscribeErrMsg: "Ovozni tanib bo'lmadi. Yozma xabar yuboring.",
      editAmountLabel: "💰 Summa",
      editFixWhatPrompt: "Nimani to'g'irlaymiz?",
      editAmountPrompt: "Yangi summani yozing (masalan 50 000):",
    };
  }
}

/**
 * Build a persistent reply keyboard with 3 buttons:
 *  - 📊 Hisobot  (text button → triggers report path)
 *  - 📈 Grafiklar (web_app button → opens dashboard charts)
 *  - ❓ Yordam   (text button → triggers help)
 *
 * Labels are localized uz/ru/en.
 * Returns a grammY Keyboard object (.resized().persistent()).
 * If appUrl is not https, the web_app button falls back to a plain text button.
 */
export function buildPersistentKeyboard(lang: "uz" | "ru" | "en", appUrl: string): Keyboard {
  const labels = getPersistentKeyboardLabels(lang);
  const kb = new Keyboard();
  kb.text(labels.report);
  if (appUrl.startsWith("https://")) {
    kb.webApp(labels.charts, appUrl);
  } else {
    // localhost: can't use web_app; add a plain text placeholder
    kb.text(labels.charts);
  }
  kb.text(labels.help);
  return kb.resized().persistent();
}

/** Localized labels for the persistent reply keyboard buttons */
export function getPersistentKeyboardLabels(lang: "uz" | "ru" | "en"): {
  report: string;
  charts: string;
  help: string;
} {
  if (lang === "ru") {
    return { report: "📊 Отчёт", charts: "📈 Графики", help: "❓ Помощь" };
  }
  if (lang === "en") {
    return { report: "📊 Report", charts: "📈 Charts", help: "❓ Help" };
  }
  return { report: "📊 Hisobot", charts: "📈 Grafiklar", help: "❓ Yordam" };
}

/**
 * Build the Dashboard reply options.
 *
 * Previously returned an inline "Moliyachi" web_app button attached to replies.
 * Now the persistent reply keyboard handles navigation — this function only
 * returns a magic-link fallback text for localhost (http) environments.
 */
export async function dashboardReplyOptions(
  userId: string
): Promise<{ extraText: string; reply_markup?: { inline_keyboard: InlineKeyboardButton[][] }; dashRows: InlineKeyboardButton[][] }> {
  const env = getEnv();
  if (env.APP_URL.startsWith("https://")) {
    // No inline button — the persistent reply keyboard has the 📈 Grafiklar web_app button.
    return { extraText: "", dashRows: [], reply_markup: undefined };
  }
  // Localhost fallback: magic-link as plain text
  const raw = await issueMagicToken(userId);
  const url = `${env.APP_URL}/api/auth/verify?token=${raw}`;
  return { extraText: `\n\n📊 Dashboard: ${url}`, dashRows: [] };
}

/** Format a localized budget overspend warning to append to a confirmation reply */
export function formatBudgetAlert(params: {
  categoryName: string;
  spentUzs: bigint;
  limitUzs: bigint;
  language: string;
}): string {
  const { categoryName, spentUzs, limitUzs, language } = params;
  const spent = formatAmount(spentUzs, language);
  const limit = formatAmount(limitUzs, language);

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
  const amountStr = formatAmount(amount, language);

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

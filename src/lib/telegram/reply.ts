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
  // Type-flip buttons (edit picker + confirmation card)
  flipToIncomeBtn: string;
  flipToExpenseBtn: string;
  // Persistent costly-ops daily cap
  costlyLimitMsg: string;
} {
  if (lang === "ru") {
    return {
      incomeBtn: "Доход",
      expenseBtn: "Расход",
      deleteBtn: "Удалить",
      editBtn: "Изменить",
      confirmDeleteBtn: "Да, удалить",
      cancelBtn: "Нет",
      deletedMsg: "Удалено.",
      expiredMsg: "Время вышло, напишите заново.",
      notFoundMsg: "Не найдено.",
      cancelledMsg: "Отменено.",
      otherCategoryBtn: "Другое",
      typeCategoryPrompt: "Напишите название категории (например: еда)",
      categoryExpiredMsg: "Время вышло, напишите заново.",
      botErrorMsg: "Извините, произошла ошибка. Пожалуйста, попробуйте ещё раз.",
      rateLimitMsg: "Подождите немного — слишком много запросов. Попробуйте через 10 минут.",
      audioTooLongMsg: "Аудио слишком длинное. Пожалуйста, отправьте запись короче 60 секунд или напишите сообщение.",
      voiceDownloadErrMsg: "Не удалось загрузить голосовое сообщение.",
      voiceTranscribeErrMsg: "Не удалось распознать голос. Пожалуйста, напишите сообщение или попробуйте ещё раз.",
      photoTooLargeMsg: "Фото слишком большое (более 5 МБ). Пожалуйста, отправьте фото меньшего размера.",
      photoDownloadErrMsg: "Не удалось загрузить фото. Попробуйте ещё раз.",
      photoProcessErrMsg: "Произошла ошибка при обработке фото. Пожалуйста, попробуйте ещё раз.",
      receiptHeader: "Прочитал чек:",
      receiptNoAmountMsg: "Не смог определить сумму из чека. Напишите вручную или пришлите более чёткое фото.",
      audioDownloadErrMsg: "Не удалось загрузить аудиофайл.",
      audioTranscribeErrMsg: "Не удалось распознать аудио. Напишите сообщение.",
      editAmountLabel: "Сумма",
      editFixWhatPrompt: "Что исправить?",
      editAmountPrompt: "Напишите новую сумму (напр. 50 000):",
      flipToIncomeBtn: "Сделать доходом",
      flipToExpenseBtn: "Сделать расходом",
      costlyLimitMsg: "Дневной лимит голосовых/фото исчерпан. Завтра снова — или напишите текстом (текст без лимита).",
    };
  } else if (lang === "en") {
    return {
      incomeBtn: "Income",
      expenseBtn: "Expense",
      deleteBtn: "Delete",
      editBtn: "Edit",
      confirmDeleteBtn: "Yes, delete",
      cancelBtn: "No",
      deletedMsg: "Deleted.",
      expiredMsg: "Expired, please write again.",
      notFoundMsg: "Not found.",
      cancelledMsg: "Cancelled.",
      otherCategoryBtn: "Other",
      typeCategoryPrompt: "Type the category name (e.g. food)",
      categoryExpiredMsg: "Expired, please write again.",
      botErrorMsg: "Sorry, something went wrong. Please try again.",
      rateLimitMsg: "Please wait — too many requests. Try again in 10 minutes.",
      audioTooLongMsg: "Audio is too long. Please send a voice message under 60 seconds or type a message.",
      voiceDownloadErrMsg: "Could not download the voice file.",
      voiceTranscribeErrMsg: "Could not transcribe the voice message. Please send a text message or try again.",
      photoTooLargeMsg: "Photo is too large (over 5 MB). Please send a smaller photo.",
      photoDownloadErrMsg: "Could not download photo. Please try again.",
      photoProcessErrMsg: "An error occurred while processing the photo. Please try again.",
      receiptHeader: "Read receipt:",
      receiptNoAmountMsg: "Could not read the total from the receipt. Please type it manually or send a clearer photo.",
      audioDownloadErrMsg: "Could not download the audio file.",
      audioTranscribeErrMsg: "Could not transcribe the audio. Please send a text message.",
      editAmountLabel: "Amount",
      editFixWhatPrompt: "Fix what?",
      editAmountPrompt: "Write the new amount (e.g. 50 000):",
      flipToIncomeBtn: "Switch to income",
      flipToExpenseBtn: "Switch to expense",
      costlyLimitMsg: "Daily voice/photo limit reached. Try again tomorrow — or type your message (text is unlimited).",
    };
  } else {
    return {
      incomeBtn: "Kirim",
      expenseBtn: "Chiqim",
      deleteBtn: "O'chirish",
      editBtn: "Tahrirlash",
      confirmDeleteBtn: "Ha, o'chir",
      cancelBtn: "Yo'q",
      deletedMsg: "O'chirildi.",
      expiredMsg: "Muddati tugadi, qaytadan yozing.",
      notFoundMsg: "Topilmadi.",
      cancelledMsg: "Bekor qilindi.",
      otherCategoryBtn: "Boshqa",
      typeCategoryPrompt: "Kategoriya nomini yozing (masalan: ovqat)",
      categoryExpiredMsg: "Muddati tugadi, qaytadan yozing.",
      botErrorMsg: "Kechirasiz, xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.",
      rateLimitMsg: "Biroz kuting — so'rovlar juda ko'p. 10 daqiqadan so'ng qaytadan urinib ko'ring.",
      audioTooLongMsg: "Audio juda uzun. Iltimos, 60 soniyadan qisqaroq ovozli xabar yuboring yoki yozma xabar kiriting.",
      voiceDownloadErrMsg: "Ovozli faylni yuklab bo'lmadi.",
      voiceTranscribeErrMsg: "Ovozni tanib bo'lmadi. Iltimos, yozma xabar yuboring yoki qaytadan urinib ko'ring.",
      photoTooLargeMsg: "Rasm juda katta (5 MB dan oshiq). Iltimos, kichikroq rasm yuboring.",
      photoDownloadErrMsg: "Rasmni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
      photoProcessErrMsg: "Rasmni qayta ishlashda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.",
      receiptHeader: "Chekdan o'qidim:",
      receiptNoAmountMsg: "Chekdan summani aniqlay olmadim. Iltimos qo'lda yozing yoki aniqroq rasm yuboring.",
      audioDownloadErrMsg: "Audio faylni yuklab bo'lmadi.",
      audioTranscribeErrMsg: "Ovozni tanib bo'lmadi. Yozma xabar yuboring.",
      editAmountLabel: "Summa",
      editFixWhatPrompt: "Nimani to'g'irlaymiz?",
      editAmountPrompt: "Yangi summani yozing (masalan 50 000):",
      flipToIncomeBtn: "Kirimga aylantirish",
      flipToExpenseBtn: "Chiqimga aylantirish",
      costlyLimitMsg: "Bugungi ovoz/rasm limiti tugadi. Ertaga yana mumkin — yoki hozir yozma xabar yuboring (matn cheksiz).",
    };
  }
}

/**
 * Build the header text for the edit-picker message.
 * Shows the CURRENT type + category + amount + a "fix what?" prompt line.
 * Example (uz): "Hozir: Chiqim · oziq-ovqat · 50 000 so'm\nNimani to'g'irlaymiz?"
 */
export function editPickerHeader(
  _typeIcon: string,
  typeWord: string,
  categoryName: string,
  formattedAmount: string,
  lang: string
): string {
  if (lang === "ru") {
    return `Сейчас: ${typeWord} · ${categoryName} · ${formattedAmount}\nЧто исправить?`;
  }
  if (lang === "en") {
    return `Now: ${typeWord} · ${categoryName} · ${formattedAmount}\nFix what?`;
  }
  return `Hozir: ${typeWord} · ${categoryName} · ${formattedAmount}\nNimani to'g'irlaymiz?`;
}

/**
 * Build a persistent reply keyboard with 4 plain TEXT buttons (2 rows):
 *  Row 1: 📊 Hisobot · 📈 Grafik
 *  Row 2: 🌐 Til     · ❓ Yordam
 *
 * Labels are localized uz/ru/en.
 * Returns a grammY Keyboard object (.resized().persistent()).
 * All four buttons are plain text — no web_app; tapping 📈 Grafik sends the
 * text to the bot, which replies with an inline URL button + 6-digit login code
 * so the user can log in from a computer browser.
 * The _appUrl parameter is kept for signature compatibility but is unused.
 */
export function buildPersistentKeyboard(lang: "uz" | "ru" | "en", _appUrl?: string): Keyboard {
  const labels = getPersistentKeyboardLabels(lang);
  const kb = new Keyboard();
  // Row 1: 📊 Hisobot + 📈 Grafik
  kb.text(labels.report).text(labels.sayt);
  kb.row();
  // Row 2: 🌐 Til + ❓ Yordam
  kb.text(labels.lang).text(labels.help);
  return kb.resized().persistent();
}

/** Localized labels for the persistent reply keyboard buttons */
export function getPersistentKeyboardLabels(lang: "uz" | "ru" | "en"): {
  report: string;
  sayt: string;
  lang: string;
  help: string;
} {
  if (lang === "ru") {
    return { report: "Отчёт", sayt: "Графики", lang: "Язык", help: "Помощь" };
  }
  if (lang === "en") {
    return { report: "Report", sayt: "Charts", lang: "Language", help: "Help" };
  }
  return { report: "Hisobot", sayt: "Grafik", lang: "Til", help: "Yordam" };
}

/**
 * Build the Dashboard reply options.
 *
 * Previously returned an inline "Moliyachi" web_app button attached to replies.
 * Now the Moliyachi MENU button (set via setup-bot.ts) handles dashboard navigation.
 * This function only returns a magic-link fallback text for localhost (http) environments.
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
  return { extraText: `\n\nDashboard: ${url}`, dashRows: [] };
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
    return `Внимание: по категории "${categoryName}" в этом месяце потрачено ${spent} — превышен лимит ${limit}.`;
  } else if (language === "en") {
    return `Heads up: you've spent ${spent} on "${categoryName}" this month — over your ${limit} limit.`;
  } else {
    return `Eslatma: "${categoryName}" bo'yicha bu oy ${spent} sarfladingiz — ${limit} limitidan oshdi.`;
  }
}

/** Format a localized confirmation string after logging a transaction */
export function formatConfirmation(params: {
  amount: bigint;
  type: "income" | "expense";
  categoryName?: string | null;
  date: string; // "today" | "yesterday" | "YYYY-MM-DD"
  language: string;
  headline?: string; // optional override; if absent use Saqladim/Сохранил/Saved
}): string {
  const { amount, type, categoryName, date, language, headline } = params;
  // Prefix the amount with +/− to convey direction (no type word, no colour emoji)
  const sign = type === "income" ? "+" : "−";
  const amountStr = sign + formatAmount(amount, language);

  const headLine =
    headline ??
    (language === "ru" ? "Сохранено" : language === "en" ? "Saved" : "Saqlandi");

  let dateLabel: string;
  if (date === "today") {
    dateLabel = language === "ru" ? "сегодня" : language === "en" ? "today" : "bugun";
  } else if (date === "yesterday") {
    dateLabel = language === "ru" ? "вчера" : language === "en" ? "yesterday" : "kecha";
  } else {
    dateLabel = date;
  }

  // One compact line: amount · category · date
  const parts = [amountStr];
  if (categoryName) parts.push(categoryName);
  parts.push(dateLabel);

  return headLine + "\n" + parts.join(" · ");
}

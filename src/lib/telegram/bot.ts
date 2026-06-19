import { Bot } from "grammy";
import { TxType, DebtDirection, DebtStatus } from "@prisma/client";
import { issueLoginCode, issueMagicToken } from "../auth/token";
import { getEnv } from "../env";
import { db } from "../db";
import { runBrain } from "../claude/brain";
import { parseAmountUzs } from "../claude/amount";
import {
  ensureDefaultCategories,
  resolveOrCreateCategory,
  getSmartCategories,
} from "../services/categories";
import { ensureDefaultAccount } from "../services/accounts";
import { createTransaction } from "../services/transactions";
import {
  getPendingAction,
  upsertPendingAction,
  clearPendingAction,
} from "../services/pending";
import { dashboardReplyOptions, formatConfirmation, formatBudgetAlert, formatAmount, getBotLabels, buildPersistentKeyboard, getPersistentKeyboardLabels, editPickerHeader, type InlineKeyboardButton } from "./reply";
import { checkExpenseBudgetBreach } from "../services/budgets";
import { createDebt, updateDebt, deleteDebt, listDebts, getDebtTotals, addDebtPayment, getDebtWithPayments, listOpenDebtsWithRemaining, getCounterpartyDebt } from "../services/debts";
import { matchOpenDebts } from "../services/debtMatch";
import { getSttProvider } from "../stt";
import { downloadTelegramFile } from "./download";
import { runAggregation, compareSpend, topTransactions } from "../services/analytics";
import type { FinanceQuery } from "../types";
import { getCashOnHand, getAccountBalances, matchAccountByName } from "../services/accounts";
import { phraseAnswer } from "../claude/answer";
import { extractReceipt } from "../claude/receipt";
import { buildMonthlyReportXlsx } from "../report/excel";
import { InputFile } from "grammy";
import { getTashkentNow } from "../dates";
import { evalCostlyCap } from "./costlyCap";
import { OWNER_CHAT_ID, notifyOwnerError } from "./notifyOwnerError";

// ── Owner chat for forwarded feedback ────────────────────────────────────────
// Feedback messages collected via /feedback or the help inline button are
// forwarded to this Telegram chat ID (the product owner).
const FEEDBACK_CHAT_ID = OWNER_CHAT_ID;

// ── Per-user rate limiter (in-memory, sliding window) ────────────────────────
// Guards STT + brain calls: 20 AI messages per 10 minutes per Telegram user.
// In-memory is acceptable for a single-instance bot deployment.

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const userMessageTimestamps = new Map<number, number[]>();

function isRateLimited(telegramUserId: number): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (userMessageTimestamps.get(telegramUserId) ?? []).filter(
    (t) => t >= windowStart
  );
  if (timestamps.length >= RATE_LIMIT_MAX) {
    userMessageTimestamps.set(telegramUserId, timestamps);
    return true;
  }
  timestamps.push(now);
  userMessageTimestamps.set(telegramUserId, timestamps);
  return false;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

// NOTE: getTashkentDateString was kept in brain.ts; it is not needed here.

function dateStringToUtc(dateStr: string): Date {
  if (dateStr === "today" || !dateStr) return new Date();
  if (dateStr === "yesterday") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d;
  }
  const parsed = new Date(dateStr + "T00:00:00+05:00");
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

// ── finalizeLog: shared log-completion helper (text path + callback path) ────
//
// Accepts a ctx-like with a reply method, the resolved user, prisma client,
// the transaction fields, and the language. Behavior is IDENTICAL to the
// original inline block: creates the tx, stores lastTransactionId, sends
// confirmation + optional budget alert + dashboard button (with a 🗑 delete
// button on a second inline row).

interface FinalizeLogParams {
  amount: number;
  txType: TxType;
  category?: string | null;
  dateStr: string;
  note?: string | null;
  /** Original foreign-currency amount before UZS conversion (for bot confirmation display). */
  originalAmount?: number | null;
  originalCurrency?: string | null;
}

async function finalizeLog(
  ctx: {
    reply: (text: string, opts?: Parameters<Bot["api"]["sendMessage"]>[2]) => Promise<unknown>;
  },
  user: { id: string },
  prisma: import("@prisma/client").PrismaClient,
  params: FinalizeLogParams,
  lang: string
): Promise<string> {
  const { amount, txType, category, dateStr, note, originalAmount, originalCurrency } = params;

  let categoryId: string | null = null;
  if (category) {
    try {
      categoryId = await resolveOrCreateCategory(user.id, category, txType);
    } catch {
      // ignore
    }
  }

  // Attach the bot transaction to the user's default account (safe: try/catch)
  let defaultAccountId: string | null = null;
  try {
    defaultAccountId = await ensureDefaultAccount(user.id);
  } catch {
    // Default account seeding must never block transaction logging
  }

  const occurredAt = dateStringToUtc(dateStr);

  const tx = await createTransaction({
    userId: user.id,
    categoryId,
    accountId: defaultAccountId,
    type: txType,
    amountUzs: BigInt(amount),
    originalCurrency:
      originalCurrency && originalCurrency !== "UZS" ? originalCurrency : null,
    originalAmount:
      originalCurrency && originalCurrency !== "UZS" && originalAmount != null
        ? BigInt(Math.round(originalAmount))
        : null,
    note: note ?? null,
    occurredAt,
    source: "bot",
  });

  // Store lastTransactionId so "fix last" and "delete last" still work
  await clearPendingAction(user.id);
  await upsertPendingAction(user.id, {
    intent: "logged",
    draft: { lastTransactionId: tx.id },
    question: "",
    lastTransactionId: tx.id,
  });

  const catRecord = categoryId
    ? await prisma.category.findUnique({ where: { id: categoryId } })
    : null;

  let confirmation = formatConfirmation({
    amount: tx.amountUzs,
    type: txType,
    categoryName: catRecord?.name ?? category ?? null,
    date: dateStr,
    language: lang,
  });

  // Append original foreign-currency info so user sees what was entered
  if (originalAmount != null && originalCurrency && originalCurrency !== "UZS") {
    const origStr = `${originalAmount} ${originalCurrency}`;
    const convNote =
      lang === "ru"
        ? ` (конвертировано из ${origStr}, ЦБ курс)`
        : lang === "en"
        ? ` (converted from ${origStr}, CBU rate)`
        : ` (${origStr} dan konvertatsiya qilindi, CBU kursi bo'yicha)`;
    confirmation = confirmation + convNote;
  }

  // Proactive budget alert
  let budgetWarning = "";
  if (txType === "expense" && categoryId) {
    try {
      const breach = await checkExpenseBudgetBreach(user.id, categoryId);
      if (breach) {
        budgetWarning =
          "\n\n" +
          formatBudgetAlert({
            categoryName: breach.categoryName,
            spentUzs: breach.spentUzs,
            limitUzs: breach.limitUzs,
            language: lang,
          });
      }
    } catch {
      // Budget check failure must NEVER block logging or the confirmation reply
    }
  }

  // Build keyboard: dashboard row (if any) + 🗑 delete row
  const dashConfirm = await dashboardReplyOptions(user.id);
  const labels = getBotLabels(lang);
  const actionRow: InlineKeyboardButton[] = [
    { text: labels.editBtn, callback_data: `e:${tx.id}` },
    { text: labels.deleteBtn, callback_data: `d:${tx.id}` },
  ];
  const isExpenseCard = tx.type === TxType.expense;
  const flipCardRow: InlineKeyboardButton[] = [{
    text: isExpenseCard ? labels.flipToIncomeBtn : labels.flipToExpenseBtn,
    callback_data: `ft:${tx.id}`,
  }];
  const keyboardRows: InlineKeyboardButton[][] = [
    ...dashConfirm.dashRows,
    actionRow,
    flipCardRow,
  ];

  await ctx.reply(confirmation + budgetWarning + dashConfirm.extraText, {
    reply_markup: { inline_keyboard: keyboardRows },
  });
  return tx.id;
}

// Re-show a transaction after an edit, with the same edit/delete keyboard.
async function showUpdatedTx(
  ctx: { reply: (text: string, opts?: Parameters<Bot["api"]["sendMessage"]>[2]) => Promise<unknown> },
  prisma: import("@prisma/client").PrismaClient,
  user: { id: string },
  txId: string,
  lang: string
): Promise<void> {
  const labels = getBotLabels(lang);
  const tx = await prisma.transaction.findFirst({
    where: { id: txId, userId: user.id, deletedAt: null },
    include: { category: true },
  });
  if (!tx) {
    await ctx.reply(labels.notFoundMsg);
    return;
  }
  // Compute date key for formatConfirmation
  const tz = (date: Date) => {
    const t = new Date(date.getTime() + 5 * 60 * 60 * 1000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  };
  const now = getTashkentNow();
  const todayStr = tz(now);
  const yesterdayStr = tz(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const txDayStr = tz(tx.occurredAt);
  const dateKey = txDayStr === todayStr ? "today" : txDayStr === yesterdayStr ? "yesterday" : txDayStr;

  const updatedHeadline =
    lang === "ru" ? "✅ Обновил" : lang === "en" ? "✅ Updated" : "✅ Yangiladim";
  const cardText = formatConfirmation({
    amount: tx.amountUzs,
    type: tx.type === TxType.income ? "income" : "expense",
    categoryName: tx.category?.name ?? null,
    date: dateKey,
    language: lang,
    headline: updatedHeadline,
  });
  const dash = await dashboardReplyOptions(user.id);
  const isExpenseUpdated = tx.type === TxType.expense;
  const rows: InlineKeyboardButton[][] = [
    ...dash.dashRows,
    [
      { text: labels.editBtn, callback_data: `e:${tx.id}` },
      { text: labels.deleteBtn, callback_data: `d:${tx.id}` },
    ],
    [{
      text: isExpenseUpdated ? labels.flipToIncomeBtn : labels.flipToExpenseBtn,
      callback_data: `ft:${tx.id}`,
    }],
  ];
  await ctx.reply(cardText + dash.extraText, {
    reply_markup: { inline_keyboard: rows },
  });
}

// ── Date label helper (Tashkent timezone) ────────────────────────────────────
function utcDateToTashkentLabel(d: Date, lang: string): string {
  const tz = (date: Date) => {
    const t = new Date(date.getTime() + 5 * 60 * 60 * 1000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  };
  const now = getTashkentNow();
  const todayStr = tz(now);
  const yesterdayStr = tz(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const dStr = tz(d);
  if (dStr === todayStr) return lang === "ru" ? "Сегодня" : lang === "en" ? "Today" : "Bugun";
  if (dStr === yesterdayStr) return lang === "ru" ? "Вчера" : lang === "en" ? "Yesterday" : "Kecha";
  return dStr;
}

// ── buildDebtCard: reusable debt confirmation/update card ────────────────────
// Returns the message text + an inline keyboard with [✏️ Tahrirla][🗑 O'chir].
// `dashRows` from dashboardReplyOptions should be prepended by the caller if needed.

interface DebtCardResult {
  text: string;
  editDeleteRow: InlineKeyboardButton[];
}

function buildDebtCard(
  debt: { id: string; counterparty: string; amountUzs: bigint; direction: DebtDirection },
  lang: "uz" | "ru" | "en",
  mode: "saved" | "updated",
  occurredAt?: Date
): DebtCardResult {
  const headLine =
    mode === "saved"
      ? (lang === "ru" ? "✅ Сохранил" : lang === "en" ? "✅ Saved" : "✅ Saqladim")
      : (lang === "ru" ? "✅ Обновил" : lang === "en" ? "✅ Updated" : "✅ Yangiladim");

  const dirLine =
    debt.direction === DebtDirection.given
      ? (lang === "ru" ? `🤝 ${debt.counterparty}у дали` : lang === "en" ? `🤝 lent to ${debt.counterparty}` : `🤝 ${debt.counterparty}ga berdingiz`)
      : (lang === "ru" ? `🤝 у ${debt.counterparty} взяли` : lang === "en" ? `🤝 borrowed from ${debt.counterparty}` : `🤝 ${debt.counterparty}dan oldingiz`);

  const amtStr = formatAmount(debt.amountUzs, lang);
  const lines = [headLine, dirLine, `💵 ${amtStr}`];
  if (occurredAt) {
    lines.push(`📅 ${utcDateToTashkentLabel(occurredAt, lang)}`);
  }
  const text = lines.join("\n");

  const editDeleteRow: InlineKeyboardButton[] = [
    { text: lang === "ru" ? "✏️ Изменить" : lang === "en" ? "✏️ Edit" : "✏️ Tahrirla", callback_data: `de:${debt.id}` },
    { text: lang === "ru" ? "🗑 Удалить" : lang === "en" ? "🗑 Delete" : "🗑 O'chir", callback_data: `dx:${debt.id}` },
  ];

  return { text, editDeleteRow };
}

// ── A1: module-level report builder (shared by command + keyword path) ───────
// Keyword that triggers this path (checked BEFORE the brain call).
// Unicode-aware boundaries: JS \b only knows ASCII word chars, so \bотчёт\b never
// matches Cyrillic. \p{L} (with /u) gives real letter boundaries for BOTH scripts and
// also blocks false positives inside words ("reporting", "excellent").
const REPORT_KEYWORD_RE = /(?:^|[^\p{L}])(hisobot|hisobotni|otchet|отчёт|отчет|report|excel)(?![\p{L}])/iu;

type ReplyFn = (text: string) => Promise<unknown>;
type ReplyWithDocumentFn = (file: InputFile, opts?: { caption?: string }) => Promise<unknown>;

async function buildAndSendReport(
  reply: ReplyFn,
  replyWithDocument: ReplyWithDocumentFn,
  prisma: import("@prisma/client").PrismaClient,
  user: { id: string; firstName: string | null },
  lang: "uz" | "ru" | "en"
): Promise<void> {
  try {
    const buf = await buildMonthlyReportXlsx(prisma, user.id, {
      lang,
      displayName: user.firstName ?? undefined,
    });
    const tashkentNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const yyyy = tashkentNow.getUTCFullYear();
    const mm = String(tashkentNow.getUTCMonth() + 1).padStart(2, "0");
    const filename = `Oson-Moliya-${yyyy}-${mm}.xlsx`;
    const caption =
      lang === "ru"
        ? `📊 Отчёт за ${yyyy}-${mm}`
        : lang === "en"
        ? `📊 Report for ${yyyy}-${mm}`
        : `📊 ${yyyy}-${mm} oy hisoboti`;
    await replyWithDocument(new InputFile(buf, filename), { caption });
  } catch (err) {
    console.error("hisobot error:", err);
    await reply(
      lang === "ru"
        ? "Не удалось создать отчёт. Попробуйте ещё раз."
        : lang === "en"
        ? "Could not generate report. Please try again."
        : "Hisobotni yaratib bo'lmadi. Qaytadan urinib ko'ring."
    );
  }
}

// ── Login access (magic-link button + 6-digit code) — module-level so both
//    handleMessage (📈 Grafik button) and createBot (/dashboard) can call it ──────
function loginAccessText(l: "uz" | "ru" | "en", code: string, siteHost: string): string {
  if (l === "ru") {
    return `Нажмите кнопку ниже — сайт откроется сам. ✅\n\n💻 С компьютера: откройте ${siteHost} и введите код ${code} (действителен 10 минут).`;
  }
  if (l === "en") {
    return `Tap the button below — the site opens itself. ✅\n\n💻 From a computer: open ${siteHost} and enter code ${code} (valid 10 minutes).`;
  }
  return `Pastdagi tugmani bosing — sayt o'zi ochiladi. ✅\n\n💻 Kompyuterdan: ${siteHost} ni oching va kodni kiriting: ${code} (10 daqiqa amal qiladi).`;
}

async function buildLoginAccessReply(
  userId: string,
  lang: "uz" | "ru" | "en"
): Promise<{ text: string; reply_markup: { inline_keyboard: InlineKeyboardButton[][] } }> {
  const env = getEnv();
  const rawToken = await issueMagicToken(userId);
  const loginUrl = `${env.APP_URL}/api/auth/verify?token=${rawToken}`;
  const code = await issueLoginCode(userId);
  const siteHost = (() => {
    try { return new URL(env.APP_URL).host; } catch { return env.APP_URL; }
  })();
  const buttonLabel =
    lang === "ru" ? "🔓 Войти на сайт" : lang === "en" ? "🔓 Open & log in" : "🔓 Saytga kirish";
  return {
    text: loginAccessText(lang, code, siteHost),
    reply_markup: { inline_keyboard: [[{ text: buttonLabel, url: loginUrl }]] },
  };
}

// ── Localized /help text (module-level so handleMessage can call it) ─────────
function helpText(l: "uz" | "ru" | "en"): string {
  if (l === "ru") {
    return `📖 Oson Moliya — Помощь\n\nОтправьте мне текст или 🎤 голосовое — я автоматически сохраню ваши расходы и доходы.\n\nКоманды:\n/start — Запустить бота\n/language — Сменить язык\n/dashboard — Открыть панель\n/hisobot — Excel отчёт за текущий месяц (также: /report или напишите «отчёт»)\n/kirish — Восстановить доступ (уже пользовались?)\n/feedback — Отправить отзыв команде\n/help — Список команд\n\n💡 Например:\n"На обед ушло 35 тысяч"\n"Зарплата 5 000 000 сум"\n"сколько расходов в этом месяце?"`;
  }
  if (l === "en") {
    return `📖 Oson Moliya — Help\n\nSend me text or a 🎤 voice message — I'll automatically save your expenses and income.\n\nCommands:\n/start — Start the bot\n/language — Change language\n/dashboard — Open the dashboard\n/hisobot — Excel monthly report (also: /report or type "report")\n/kirish — Recover access (used this before?)\n/feedback — Send feedback to the team\n/help — Command list\n\n💡 For example:\n"Spent 35 thousand on lunch"\n"Salary 5,000,000 so'm"\n"how much did I spend this month?"`;
  }
  return `📖 Oson Moliya — Yordam\n\nMenga matn yoki 🎤 ovozli xabar yuboring — xarajat va daromadlaringizni avtomatik saqlayman.\n\nBuyruqlar:\n/start — Botni ishga tushirish\n/language — Tilni o'zgartirish\n/dashboard — Panelni ochish\n/hisobot — Excel oylik hisobot (shuningdek: /report yoki «hisobot» deb yozing)\n/kirish — Kirishni tiklash (oldin foydalanganmisiz?)\n/feedback — Jamoa bilan fikr ulashing\n/help — Buyruqlar ro'yxati\n\n💡 Masalan:\n"Tushlikka 35 ming ketdi"\n"Oylik 5 000 000 so'm"\n"bu oy qancha chiqim?"`;
}

/** Returns the inline keyboard row for the /help reply — includes the feedback button */
function helpInlineKeyboard(l: "uz" | "ru" | "en"): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  const label =
    l === "ru" ? "💬 Оставить отзыв" : l === "en" ? "💬 Send Feedback" : "💬 Fikr / Taklif";
  return { inline_keyboard: [[{ text: label, callback_data: "feedback:start" }]] };
}

// ── applyRepayment — shared helper for repay_debt dispatch + rp: callback ───

async function applyRepayment(
  ctx: { reply: (text: string, opts?: Parameters<Bot["api"]["sendMessage"]>[2]) => Promise<unknown> },
  user: { id: string },
  lang: "uz" | "ru" | "en",
  debtId: string,
  remainingBefore: bigint,
  amount: number | null,
  repayAll: boolean,
  dateStr: string
): Promise<void> {
  const pay = repayAll
    ? remainingBefore
    : amount != null && BigInt(amount) > remainingBefore
    ? remainingBefore
    : BigInt(amount ?? 0);

  if (pay <= 0n) {
    await ctx.reply(
      lang === "ru"
        ? "Нечего погашать — сумма не может быть нулевой."
        : lang === "en"
        ? "Nothing to pay — amount cannot be zero."
        : "To'lanadigan narsa yo'q — summa nol bo'lishi mumkin emas."
    );
    return;
  }

  try {
    await addDebtPayment({
      debtId,
      userId: user.id,
      amountUzs: pay,
      occurredAt: dateStringToUtc(dateStr),
      note: null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "EXCEEDS_REMAINING" || msg === "AMOUNT_INVALID") {
      await ctx.reply(
        lang === "ru"
          ? "Ошибка: сумма превышает остаток долга или некорректна."
          : lang === "en"
          ? "Error: amount exceeds the remaining balance or is invalid."
          : "Xato: summa qoldiqdan ko'p yoki noto'g'ri."
      );
      return;
    }
    throw err;
  }

  const remainingAfter = remainingBefore - pay;
  const capped = !repayAll && amount != null && BigInt(amount) > remainingBefore;

  // Fetch debt for counterparty name
  const debtRow = await getDebtWithPayments(debtId, user.id);
  const cpName = debtRow?.counterparty ?? "";

  let text: string;
  if (remainingAfter <= 0n) {
    text =
      lang === "ru"
        ? `✅ Долг полностью погашён: ${cpName} · ${formatAmount(pay, lang)}`
        : lang === "en"
        ? `✅ Debt fully settled: ${cpName} · ${formatAmount(pay, lang)}`
        : `✅ Qarz to'liq yopildi: ${cpName} · ${formatAmount(pay, lang)}`;
  } else {
    text =
      lang === "ru"
        ? `✅ Платёж записан: ${formatAmount(pay, lang)}. ${cpName} — остаток: ${formatAmount(remainingAfter, lang)}`
        : lang === "en"
        ? `✅ Payment recorded: ${formatAmount(pay, lang)}. ${cpName} — remaining: ${formatAmount(remainingAfter, lang)}`
        : `✅ To'lov yozildi: ${formatAmount(pay, lang)}. ${cpName} — qoldiq: ${formatAmount(remainingAfter, lang)}`;
  }

  if (capped) {
    const note =
      lang === "ru"
        ? " (запрошенная сумма превышала остаток — закрыт полностью)"
        : lang === "en"
        ? " (requested amount exceeded the remaining — closed in full)"
        : " (so'ralgan summa qoldiqdan ko'p edi — qoldiq to'liq yopildi)";
    text += note;
  }

  const dash = await dashboardReplyOptions(user.id);
  await ctx.reply(text + dash.extraText, {
    reply_markup: { inline_keyboard: [...dash.dashRows] },
  });
}

// ── replyNatural: thin phrasing wrapper (single-figure answers only) ──────────
// Use ONLY for single-figure answers. For multi-line/structured answers reply
// with the deterministic template text directly (cleaner + safer + cheaper).

async function replyNatural(
  reply: (t: string) => Promise<unknown>,
  question: string,
  lang: "uz" | "ru" | "en",
  headline: string,
  numbers: string[],
  fallbackText: string
): Promise<void> {
  const natural = await phraseAnswer({ question, lang, headline, numbers, detail: fallbackText });
  await reply(natural ?? fallbackText);
}

// ── Shared message-handling logic (text + voice share this path) ─────────────

async function handleMessage(
  ctx: {
    from: { id: number; first_name?: string; username?: string } | undefined;
    reply: (text: string, opts?: Parameters<Bot["api"]["sendMessage"]>[2]) => Promise<unknown>;
    replyWithDocument?: ReplyWithDocumentFn;
    /** Optional bot API — passed through from command/message handlers so
     *  feedback messages can be forwarded to the owner without the brain. */
    api?: Bot["api"];
  },
  text: string,
  prisma: import("@prisma/client").PrismaClient
): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  // Get or create user
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(from.id) },
    create: {
      telegramId: BigInt(from.id),
      firstName: from.first_name ?? null,
      username: from.username ?? null,
      language: "uz",
    },
    update: {
      firstName: from.first_name ?? null,
      username: from.username ?? null,
    },
  });

  await ensureDefaultCategories(user.id);

  // Load categories for context
  const userCategories = await prisma.category.findMany({
    where: { userId: user.id },
    select: { name: true },
  });
  const categoryNames = userCategories.map((c) => c.name);

  // Load pending action
  const pending = await getPendingAction(user.id);

  // ── Persistent reply keyboard button handlers ─────────────────────────────
  // Exact-match the button labels before passing to the brain.
  // We check all three language variants so the correct button always fires
  // regardless of which language was active when the keyboard was rendered.
  const REPORT_BTNS = ["📊 Hisobot", "📊 Отчёт", "📊 Report"];
  const HELP_BTNS = ["❓ Yordam", "❓ Помощь", "❓ Help"];
  const LANG_BTNS = ["🌐 Til", "🌐 Язык", "🌐 Language"];
  const GRAFIK_BTNS = ["📈 Grafik", "📈 Графики", "📈 Charts"];

  if (REPORT_BTNS.includes(text)) {
    const btnLang = (user.language as "uz" | "ru" | "en") ?? "uz";
    if (ctx.replyWithDocument) {
      await buildAndSendReport(
        (t) => ctx.reply(t),
        ctx.replyWithDocument,
        prisma,
        user,
        btnLang
      );
    } else {
      const fallback =
        btnLang === "ru"
          ? "Для получения отчёта используйте команду /hisobot."
          : btnLang === "en"
          ? "Please use /hisobot command to get the report."
          : "Hisobot olish uchun /hisobot buyrug'idan foydalaning.";
      await ctx.reply(fallback);
    }
    return;
  }

  if (HELP_BTNS.includes(text)) {
    const helpLang = (user.language as "uz" | "ru" | "en") ?? "uz";
    await ctx.reply(helpText(helpLang), { reply_markup: helpInlineKeyboard(helpLang) });
    return;
  }

  if (LANG_BTNS.includes(text)) {
    // Trigger the same language-picker as /til / /language command
    await ctx.reply("Tilni tanlang / Выберите язык / Choose your language:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🇺🇿 O'zbekcha", callback_data: "lang:uz" },
            { text: "🇷🇺 Русский", callback_data: "lang:ru" },
            { text: "🇬🇧 English", callback_data: "lang:en" },
          ],
        ],
      },
    });
    return;
  }

  if (GRAFIK_BTNS.includes(text)) {
    // Reply with the same magic-link + 6-digit code as /dashboard — for computer login.
    const grafikLang = (user.language as "uz" | "ru" | "en") ?? "uz";
    const access = await buildLoginAccessReply(user.id, grafikLang);
    await ctx.reply(access.text, { reply_markup: access.reply_markup });
    return;
  }

  // ── A1: Report-on-demand keyword shortcut ─────────────────────────────────
  // Check BEFORE the brain so it is always fast and reliable.
  // Only fires when the whole message is essentially just the report keyword —
  // this avoids interfering with genuine finance queries like
  // "bu oy logistika qancha?" (contains no hisobot/отчёт/report word).
  if (REPORT_KEYWORD_RE.test(text)) {
    const kLang = (user.language as "uz" | "ru" | "en") ?? "uz";
    if (ctx.replyWithDocument) {
      await buildAndSendReport(
        (t) => ctx.reply(t),
        ctx.replyWithDocument,
        prisma,
        user,
        kLang
      );
    } else {
      // Defensive fallback: handler was wired without replyWithDocument — tell the
      // user to use the /hisobot command instead of going silent.
      const fallbackMsg =
        kLang === "ru"
          ? "Для получения отчёта используйте команду /hisobot."
          : kLang === "en"
          ? "Please use /hisobot command to get the report."
          : "Hisobot olish uchun /hisobot buyrug'idan foydalaning.";
      await ctx.reply(fallbackMsg);
    }
    return;
  }

  // Editing a transaction's AMOUNT via typed text (covers STT mistakes)
  if (pending && pending.intent === "edit_tx") {
    const ed = pending.draft as Record<string, unknown>;
    if (ed.field === "amount" && typeof ed.txId === "string") {
      const elang = (user.language as "uz" | "ru" | "en") ?? "uz";
      const tx = await prisma.transaction.findFirst({
        where: { id: ed.txId, userId: user.id, deletedAt: null },
      });
      if (!tx) {
        await clearPendingAction(user.id);
        await ctx.reply(getBotLabels(elang).notFoundMsg);
        return;
      }
      const newAmt = parseAmountUzs(text);
      if (newAmt === null || newAmt <= 0n) {
        await ctx.reply(
          elang === "ru"
            ? "Не понял сумму. Напишите числом, напр. 50 000."
            : elang === "en"
            ? "Couldn't read the amount. Write a number, e.g. 50 000."
            : "Summani tushunmadim. Raqamda yozing, masalan 50 000."
        );
        return;
      }
      await prisma.transaction.update({ where: { id: ed.txId, userId: user.id }, data: { amountUzs: newAmt } });
      await clearPendingAction(user.id);
      await upsertPendingAction(user.id, {
        intent: "logged",
        draft: { lastTransactionId: ed.txId },
        question: "",
        lastTransactionId: ed.txId,
      });
      await showUpdatedTx({ reply: (t, o) => ctx.reply(t, o) }, prisma, user, ed.txId, elang);
      return;
    }

    if (ed.field === "category_text" && typeof ed.txId === "string") {
      const elang = (user.language as "uz" | "ru" | "en") ?? "uz";
      const name = text.trim();
      if (!name) {
        await ctx.reply(
          elang === "ru" ? "Введите название категории:" : elang === "en" ? "Enter the category name:" : "Kategoriya nomini yozing:",
          { reply_markup: { force_reply: true } }
        );
        return;
      }
      const tx = await prisma.transaction.findFirst({
        where: { id: ed.txId, userId: user.id, deletedAt: null },
        select: { id: true, type: true },
      });
      if (!tx) {
        await clearPendingAction(user.id);
        await ctx.reply(getBotLabels(elang).notFoundMsg);
        return;
      }
      const catId = await resolveOrCreateCategory(user.id, name, tx.type);
      await prisma.transaction.update({ where: { id: ed.txId, userId: user.id }, data: { categoryId: catId } });
      await clearPendingAction(user.id);
      await upsertPendingAction(user.id, {
        intent: "logged",
        draft: { lastTransactionId: ed.txId },
        question: "",
        lastTransactionId: ed.txId,
      });
      await showUpdatedTx({ reply: (t, o) => ctx.reply(t, o) }, prisma, user, ed.txId, elang);
      return;
    }
  }

  // Editing a debt field via typed text (literal — never re-parsed by brain)
  if (pending && pending.intent === "edit_debt") {
    const ed = pending.draft as Record<string, unknown>;
    const debtId = ed.debtId as string;
    const elang = (user.language as "uz" | "ru" | "en") ?? "uz";
    const elabels = getBotLabels(elang);

    if (ed.field === "name") {
      const newName = text.trim();
      if (!newName) {
        await ctx.reply(
          elang === "ru" ? "Введите имя." : elang === "en" ? "Please enter a name." : "Ismni yozing."
        );
        return;
      }
      const updated = await updateDebt(debtId, user.id, { counterparty: newName });
      if (!updated) {
        await clearPendingAction(user.id);
        await ctx.reply(elabels.notFoundMsg);
        return;
      }
      await clearPendingAction(user.id);
      const card = buildDebtCard(updated, elang, "updated", updated.occurredAt);
      const dash = await dashboardReplyOptions(user.id);
      await ctx.reply(card.text + dash.extraText, {
        reply_markup: { inline_keyboard: [...dash.dashRows, card.editDeleteRow] },
      });
      return;
    }

    if (ed.field === "amount") {
      const amt = parseAmountUzs(text);
      if (amt === null || amt <= 0n) {
        await ctx.reply(
          elang === "ru"
            ? "Не понял сумму. Напишите числом, напр. 50 000."
            : elang === "en"
            ? "Couldn't read the amount. Write a number, e.g. 50 000."
            : "Summani tushunmadim. Raqamda yozing, masalan 50 000."
        );
        return;
      }
      const updated = await updateDebt(debtId, user.id, { amountUzs: amt });
      if (!updated) {
        await clearPendingAction(user.id);
        await ctx.reply(elabels.notFoundMsg);
        return;
      }
      await clearPendingAction(user.id);
      const card = buildDebtCard(updated, elang, "updated", updated.occurredAt);
      const dash = await dashboardReplyOptions(user.id);
      await ctx.reply(card.text + dash.extraText, {
        reply_markup: { inline_keyboard: [...dash.dashRows, card.editDeleteRow] },
      });
      return;
    }
  }

  // ── feedback pending — must come BEFORE the brain so the text is never parsed
  //    as a transaction. The user's message is forwarded to the owner verbatim.
  if (pending && pending.intent === "feedback") {
    const fbLang = (user.language as "uz" | "ru" | "en") ?? "uz";
    try {
      await ctx.api?.sendMessage(
        FEEDBACK_CHAT_ID,
        `📩 Fikr — ${from.first_name ?? ""} (@${from.username ?? "—"}, id ${from.id}):\n\n${text}`
      );
    } catch (fbErr) {
      console.error("feedback forward error:", fbErr);
    }
    await clearPendingAction(user.id);
    await ctx.reply(
      fbLang === "ru"
        ? "✅ Rahmat! Ваш отзыв отправлен команде."
        : fbLang === "en"
        ? "✅ Thank you! Your feedback has been sent to the team."
        : "✅ Rahmat! Fikringiz yuborildi."
    );
    return;
  }

  // Run brain
  let brainResult;
  try {
    brainResult = await runBrain({
      text,
      user: { id: user.id, language: user.language },
      pending,
      categoryNames,
    });
  } catch (err) {
    console.error("Brain error:", err);
    const brainErrLang = (user.language as "uz" | "ru" | "en") ?? "uz";
    await ctx.reply(getBotLabels(brainErrLang).botErrorMsg);
    return;
  }

  const { intent } = brainResult;

  // Reply ONLY in the user's chosen language (set via the /start language picker).
  // Do NOT auto-switch based on the detected input language.
  const lang = (user.language as "uz" | "ru" | "en") ?? "uz";

  // ── log_multiple ─────────────────────────────────────────────────────────
  if (intent.intent === "log_multiple") {
    try {
      const itemsRaw = (intent as Record<string, unknown>).items as Array<Record<string, unknown>> | undefined;
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];

      // Each item is either a DEBT (kind="debt" + direction + counterparty) or a TX (income/expense).
      const isDebtItem = (it: Record<string, unknown>) =>
        it.kind === "debt" &&
        (it.direction === "given" || it.direction === "taken") &&
        typeof it.counterparty === "string" &&
        (it.counterparty as string).trim().length > 0 &&
        typeof it.amount === "number" &&
        (it.amount as number) > 0;
      const isTxItem = (it: Record<string, unknown>) =>
        it.kind !== "debt" &&
        (it.type === "income" || it.type === "expense") &&
        typeof it.amount === "number" &&
        (it.amount as number) > 0;

      const valid = items.filter((it) => isDebtItem(it) || isTxItem(it));

      if (valid.length === 0) {
        const fallback =
          lang === "ru"
            ? "Не понял — напишите каждую операцию отдельно."
            : lang === "en"
            ? "I didn't understand — please write each item separately."
            : "Tushunmadim — har birini alohida yozing.";
        await ctx.reply(fallback);
        return;
      }

      // Numbered FULL per-entry blocks (user-preferred look): each entry rendered like a single
      // confirmation card, prefixed with its number so it matches the [1][2][3] edit picker.
      const blocks: string[] = [];
      const batchEntries: Array<{ id: string; kind: "tx" | "debt"; label: string }> = [];
      for (let idx = 0; idx < valid.length; idx++) {
        const it = valid[idx];
        const n = idx + 1;
        if (isDebtItem(it)) {
          const cp = (it.counterparty as string).trim();
          const amt = it.amount as number;
          const dir = it.direction === "given" ? DebtDirection.given : DebtDirection.taken;
          const createdBatchDebt = await createDebt({
            userId: user.id,
            counterparty: cp,
            amountUzs: BigInt(amt),
            direction: dir,
            note: (it.note as string | null | undefined) ?? null,
            occurredAt: dateStringToUtc((it.date as string | undefined) ?? "today"),
          });
          const amtFmt = formatAmount(BigInt(amt), lang);
          const arrow = dir === DebtDirection.given ? "↗️" : "↙️";
          const savedWord = lang === "ru" ? "Сохранил" : lang === "en" ? "Saved" : "Saqladim";
          const d = (it.date as string | undefined) ?? "today";
          const dayLabel =
            d === "today" ? (lang === "ru" ? "Сегодня" : lang === "en" ? "Today" : "Bugun")
            : d === "yesterday" ? (lang === "ru" ? "Вчера" : lang === "en" ? "Yesterday" : "Kecha")
            : d;
          const dirText = dir === DebtDirection.given
            ? (lang === "ru" ? `Дал в долг: ${cp}` : lang === "en" ? `Lent to ${cp}` : `${cp}ga berdim`)
            : (lang === "ru" ? `Взял у ${cp}` : lang === "en" ? `Borrowed from ${cp}` : `${cp}dan oldim`);
          blocks.push(`${n}. ✅ ${savedWord}\n${arrow} ${dirText}\n💵 ${amtFmt}\n📅 ${dayLabel}`);
          batchEntries.push({ id: createdBatchDebt.id, kind: "debt", label: `${cp} ${amtFmt}` });
        } else {
          // Run finalizeLog for side effects (create tx + pending + budget) but DISCARD its reply;
          // build the numbered block ourselves via formatConfirmation (no per-entry dashboard hint).
          const sinkCtx = { reply: () => Promise.resolve(undefined as unknown) };
          const batchTxId = await finalizeLog(
            sinkCtx,
            user,
            prisma,
            {
              amount: it.amount as number,
              txType: it.type === "income" ? TxType.income : TxType.expense,
              category: (it.category as string | null | undefined) ?? null,
              dateStr: (it.date as string | undefined) ?? "today",
              note: (it.note as string | null | undefined) ?? null,
              originalAmount: (it._originalAmount as number | undefined) ?? null,
              originalCurrency: (it._originalCurrency as string | undefined) ?? null,
            },
            lang
          );
          const block = formatConfirmation({
            amount: BigInt(it.amount as number),
            type: it.type === "income" ? TxType.income : TxType.expense,
            categoryName: (it.category as string | null | undefined) ?? null,
            date: (it.date as string | undefined) ?? "today",
            language: lang,
          });
          blocks.push(`${n}. ${block}`);
          const amtFmt = formatAmount(BigInt(it.amount as number), lang);
          const cat = (it.category as string | null | undefined) ?? null;
          batchEntries.push({ id: batchTxId, kind: "tx", label: `${amtFmt}${cat ? ` · ${cat}` : ""}` });
        }
      }

      const header =
        lang === "ru"
          ? `✅ Записал ${valid.length} операц.:`
          : lang === "en"
          ? `✅ Logged ${valid.length} entries:`
          : `✅ ${valid.length} ta yozuv qo'shildi:`;

      const skipped = items.length - valid.length;
      const skipNote =
        skipped > 0
          ? lang === "ru"
            ? `\n\n(${skipped} не понял — напишите отдельно)`
            : lang === "en"
            ? `\n\n(${skipped} unclear — write separately)`
            : `\n\n(${skipped} tasini tushunmadim — alohida yozing)`
          : "";

      if (batchEntries.length >= 1) {
        await upsertPendingAction(user.id, {
          intent: "multi_edit",
          draft: { entries: batchEntries },
          question: "",
        });
      }

      const dash = await dashboardReplyOptions(user.id);
      const batchKeyboardRows: InlineKeyboardButton[][] = [...dash.dashRows];
      if (batchEntries.length >= 1) {
        batchKeyboardRows.push([{
          text: lang === "ru" ? "✏️ Изменить запись" : lang === "en" ? "✏️ Edit an entry" : "✏️ Tahrirlash",
          callback_data: "medit:menu",
        }]);
      }
      await ctx.reply(
        header + "\n\n" + blocks.join("\n\n") + skipNote + dash.extraText,
        { reply_markup: { inline_keyboard: batchKeyboardRows } }
      );
      return;
    } catch (err) {
      console.error("log_multiple error:", err);
      const errMsg =
        lang === "ru"
          ? "Не удалось записать — попробуйте ещё раз."
          : lang === "en"
          ? "Couldn't log — please try again."
          : "Yozib bo'lmadi — qayta urinib ko'ring.";
      await ctx.reply(errMsg);
      return;
    }
  }

  // ── log_income / log_expense ──────────────────────────────────────────────
  if (intent.intent === "log_income" || intent.intent === "log_expense") {
    // FIX (Phase-1 bug): preserve draft intent/type from pending on resume so
    // a clarified EXPENSE doesn't accidentally log as INCOME.
    let txType: TxType;
    if (pending) {
      const draftType = (pending.draft as Record<string, unknown>).type as string | undefined;
      const draftIntent = (pending.draft as Record<string, unknown>).intent as string | undefined;
      if (draftType === "income" || draftType === "expense") {
        txType = draftType === "income" ? TxType.income : TxType.expense;
      } else if (draftIntent === "log_income" || draftIntent === "log_expense") {
        txType = draftIntent === "log_income" ? TxType.income : TxType.expense;
      } else {
        txType = intent.intent === "log_income" ? TxType.income : TxType.expense;
      }
    } else {
      txType = intent.intent === "log_income" ? TxType.income : TxType.expense;
    }

    // Merge amount and category from draft
    const amount = pending
      ? intent.amount ??
        ((pending.draft as Record<string, unknown>).amount as number | undefined)
      : intent.amount;
    const category = pending
      ? intent.category ??
        ((pending.draft as Record<string, unknown>).category as string | undefined)
      : intent.category;

    if (!amount || amount <= 0) {
      const draft = {
        intent: intent.intent,
        type: txType === TxType.income ? "income" : "expense",
        category: category ?? null,
        date: intent.date ?? "today",
        note: intent.note ?? null,
      };
      const question =
        lang === "ru"
          ? "Сколько сумм? Напишите сумму."
          : lang === "en"
          ? "How much? Please write the amount."
          : "Qancha so'm? Miqdorni yozing.";

      await upsertPendingAction(user.id, {
        intent: intent.intent,
        draft,
        question,
      });
      await ctx.reply(question, {
        reply_markup: {
          force_reply: true,
          input_field_placeholder:
            lang === "ru"
              ? "Например: 500 000"
              : lang === "en"
              ? "e.g. 500 000"
              : "Masalan: 500 ming",
        },
      });
      return;
    }

    // We have enough to log — delegate to finalizeLog
    const dateStr = intent.date ?? "today";
    const intentAny = intent as Record<string, unknown>;
    await finalizeLog(ctx, user, prisma, {
      amount,
      txType,
      category,
      dateStr,
      note: intent.note ?? null,
      originalAmount: (intentAny._originalAmount as number | undefined) ?? null,
      originalCurrency: (intentAny._originalCurrency as string | undefined) ?? null,
    }, lang);
    return;
  }

  // ── log_debt ──────────────────────────────────────────────────────────────
  if (intent.intent === "log_debt") {
    const intentAny = intent as Record<string, unknown>;
    const amount: number | null | undefined = intent.amount;
    const counterparty: string | null = (intentAny.counterparty as string | null | undefined)?.trim() || null;
    const direction: "given" | "taken" | null = (intentAny.debt_direction as "given" | "taken" | null | undefined) ?? null;
    const dateStr: string = intent.date ?? "today";

    // Missing amount or counterparty — ask user to retype fully
    if (!amount || amount <= 0 || !counterparty) {
      const ask =
        lang === "ru"
          ? "Пожалуйста, напишите полностью: кому/от кого и сколько. Например: \"Сарвару 2 млн в долг дал\"."
          : lang === "en"
          ? "Please write in full: who and how much. E.g. \"Lent 2 mln to Sarvar\"."
          : "Iltimos to'liq yozing: kimga/kimdan va qancha. Masalan: \"Sarvarga 2 mln qarz berdim\".";
      await ctx.reply(ask, {
        reply_markup: {
          force_reply: true,
          input_field_placeholder:
            lang === "ru"
              ? "Например: Сарвару 2 млн в долг"
              : lang === "en"
              ? "e.g. Lent 2 mln to Sarvar"
              : "Masalan: Sarvarga 2 mln qarz berdim",
        },
      });
      return;
    }

    // Direction known — save immediately (no pre-confirm step)
    if (direction !== null) {
      const created = await createDebt({
        userId: user.id,
        counterparty,
        amountUzs: BigInt(amount),
        direction: direction === "given" ? DebtDirection.given : DebtDirection.taken,
        note: null,
        occurredAt: dateStringToUtc(dateStr),
      });
      await clearPendingAction(user.id);
      const card = buildDebtCard(created, lang, "saved", created.occurredAt);
      const dashDebt = await dashboardReplyOptions(user.id);
      await ctx.reply(card.text + dashDebt.extraText, {
        reply_markup: {
          inline_keyboard: [...dashDebt.dashRows, card.editDeleteRow],
        },
      });
      return;
    }

    // Direction unknown — store draft and ask
    await upsertPendingAction(user.id, {
      intent: "confirm_debt",
      draft: { counterparty, direction: null, amount, dateStr },
      question: "",
    });

    const amountStr = formatAmount(BigInt(amount), lang);
    const dirQuestion =
      lang === "ru"
        ? `📋 Понял долг:\n👤 ${counterparty}\n💰 ${amountStr}\n\nВы дали или взяли?`
        : lang === "en"
        ? `📋 Got it — debt:\n👤 ${counterparty}\n💰 ${amountStr}\n\nDid you lend or borrow?`
        : `📋 Qarz tushundim:\n👤 ${counterparty}\n💰 ${amountStr}\n\nYo'nalishini tanlang:`;

    await ctx.reply(dirQuestion, {
      reply_markup: {
        inline_keyboard: [[
          { text: lang === "ru" ? "↗️ Я дал" : lang === "en" ? "↗️ I lent" : "↗️ Men berdim", callback_data: "dd:given" },
          { text: lang === "ru" ? "↙️ Я взял" : lang === "en" ? "↙️ I borrowed" : "↙️ Men oldim", callback_data: "dd:taken" },
        ]],
      },
    });
    return;
  }

  // ── repay_debt ────────────────────────────────────────────────────────────
  if (intent.intent === "repay_debt") {
    const intentAny = intent as Record<string, unknown>;
    const counterparty: string | null = (intentAny.counterparty as string | null | undefined)?.trim() || null;
    const direction: "given" | "taken" | null = (intentAny.debt_direction as "given" | "taken" | null | undefined) ?? null;
    const repayAll: boolean = (intentAny.repay_all as boolean | undefined) === true;
    const amount: number | null = intent.amount ?? null;
    const dateStr: string = intent.date ?? "today";

    if (!counterparty) {
      const ask =
        lang === "ru"
          ? "Кто вернул долг? Напишите полностью, например: \"Сарвар вернул 2 млн\"."
          : lang === "en"
          ? "Who repaid the debt? Please write in full, e.g. \"Sarvar repaid 2 mln\"."
          : "Kim qaytardi? To'liq yozing, masalan: \"Sarvar 2 mln qaytardi\".";
      await ctx.reply(ask, {
        reply_markup: {
          force_reply: true,
          input_field_placeholder:
            lang === "ru"
              ? "Например: Сарвар вернул 2 млн"
              : lang === "en"
              ? "e.g. Sarvar repaid 2 mln"
              : "Masalan: Sarvar 2 mln qaytardi",
        },
      });
      return;
    }

    if (!repayAll && (!amount || amount <= 0)) {
      const ask =
        lang === "ru"
          ? "Сколько было возвращено? Напишите, например: \"Сарвар вернул 2 млн\" или \"Сарвар вернул всё\"."
          : lang === "en"
          ? "How much was repaid? E.g. \"Sarvar repaid 2 mln\" or \"Sarvar repaid everything\"."
          : "Qancha qaytarildi? Masalan: \"Sarvar 2 mln qaytardi\" yoki \"Sarvar hammasini qaytardi\".";
      await ctx.reply(ask, {
        reply_markup: {
          force_reply: true,
          input_field_placeholder:
            lang === "ru"
              ? "Например: Сарвар вернул 2 млн"
              : lang === "en"
              ? "e.g. Sarvar repaid 2 mln"
              : "Masalan: Sarvar 2 mln qaytardi",
        },
      });
      return;
    }

    const open = await listOpenDebtsWithRemaining(user.id);
    const dbDirection = direction === "given" ? "given" as const : direction === "taken" ? "taken" as const : null;
    const m = matchOpenDebts(open, counterparty, dbDirection);

    if (m.status === "none") {
      const openNames = open.length > 0
        ? open.map((d) => d.counterparty).join(", ")
        : null;
      const hint = openNames
        ? (lang === "ru"
          ? ` Открытые долги: ${openNames}.`
          : lang === "en"
          ? ` Open debts: ${openNames}.`
          : ` Ochiq qarzlar: ${openNames}.`)
        : "";
      await ctx.reply(
        (lang === "ru"
          ? `Открытый долг с "${counterparty}" не найден.`
          : lang === "en"
          ? `No open debt found for "${counterparty}".`
          : `"${counterparty}" bilan ochiq qarz topilmadi.`) + hint
      );
      return;
    }

    if (m.status === "many") {
      await upsertPendingAction(user.id, {
        intent: "repay_pick",
        draft: { amount: amount ?? null, repayAll, dateStr },
        question: "",
      });
      const dirLabel = (d: { direction: string }) =>
        d.direction === "given"
          ? (lang === "ru" ? "мне должен" : lang === "en" ? "owes me" : "menga qarzdor")
          : (lang === "ru" ? "я должен" : lang === "en" ? "I owe" : "men qarzdorman");

      const buttons = m.matches.map((d) => ([{
        text: `${d.counterparty} · ${formatAmount(d.remaining, lang)} (${dirLabel(d)})`,
        callback_data: `rp:${d.id}`,
      }]));

      await ctx.reply(
        lang === "ru"
          ? "Какой долг погасить?"
          : lang === "en"
          ? "Which debt to repay?"
          : "Qaysi qarzni yopish?",
        { reply_markup: { inline_keyboard: buttons } }
      );
      return;
    }

    // Exactly one match
    const d = m.matches[0];
    await applyRepayment(ctx, user, lang, d.id, d.remaining, amount, repayAll, dateStr);
    return;
  }

  // ── clarify_needed ────────────────────────────────────────────────────────
  if (intent.intent === "clarify_needed") {
    // FIX (Phase-1 bug): preserve draft intent/type — do NOT hardcode "log_income"
    const draftType = intent.type ?? null;
    const draftIntent =
      draftType === "income"
        ? "log_income"
        : draftType === "expense"
        ? "log_expense"
        : pending
        ? ((pending.draft as Record<string, unknown>).intent as string) ?? "log_income"
        : "log_income";

    const draft = {
      intent: draftIntent,
      type:
        draftType ??
        (pending
          ? ((pending.draft as Record<string, unknown>).type as string) ?? null
          : null),
      amount: intent.amount ?? null,
      category: intent.category ?? null,
      date: intent.date ?? "today",
      note: intent.note ?? null,
    };
    await upsertPendingAction(user.id, {
      intent: "clarify_needed",
      draft,
      question: intent.reply_text,
    });

    // Determine which field is missing to decide the right keyboard type.
    const typeIsUnknown = (draft.amount != null && draft.amount > 0) && !draft.type;
    const categoryIsUnknown =
      (draft.amount != null && draft.amount > 0) &&
      !!draft.type &&
      !draft.category &&
      (intent.missing_fields ?? []).includes("category");

    const labels = getBotLabels(lang);

    if (typeIsUnknown) {
      // Show [🟢 Kirim] [🔴 Chiqim] buttons
      await ctx.reply(intent.reply_text, {
        reply_markup: {
          inline_keyboard: [[
            { text: labels.incomeBtn, callback_data: "t:income" },
            { text: labels.expenseBtn, callback_data: "t:expense" },
          ]],
        },
      });
    } else if (categoryIsUnknown) {
      // Load up to 6 existing categories of this type and show as buttons
      const catTxType =
        draft.type === "income" ? ("income" as const) : ("expense" as const);
      const existingCats = await prisma.category.findMany({
        where: { userId: user.id, type: catTxType as import("@prisma/client").TxType },
        select: { id: true, name: true },
        take: 6,
      });

      // Build inline keyboard: ≤2 buttons per row + "✏️ Boshqa" at the end
      const catButtons: InlineKeyboardButton[] = existingCats.map((c) => ({
        text: c.name,
        callback_data: `c:${c.id}`,
      }));
      const otherBtn: InlineKeyboardButton = {
        text: labels.otherCategoryBtn,
        callback_data: "c:other",
      };

      const rows: InlineKeyboardButton[][] = [];
      for (let i = 0; i < catButtons.length; i += 2) {
        rows.push(catButtons.slice(i, i + 2));
      }
      rows.push([otherBtn]);

      await ctx.reply(intent.reply_text, {
        reply_markup: { inline_keyboard: rows },
      });
    } else {
      // Amount missing or other — plain text + a reply box so the user can type the answer
      await ctx.reply(intent.reply_text, {
        reply_markup: {
          force_reply: true,
          input_field_placeholder:
            lang === "ru"
              ? "Напишите ответ"
              : lang === "en"
              ? "Write your answer"
              : "Javobni yozing",
        },
      });
    }
    return;
  }

  // ── debt_query ────────────────────────────────────────────────────────────
  if (intent.intent === "debt_query") {
    try {
      const intentAny = intent as Record<string, unknown>;
      const cpQuery = (intentAny.counterparty as string | null | undefined)?.trim() || null;

      // Per-counterparty branch (new in T6)
      if (cpQuery) {
        const r = await getCounterpartyDebt(user.id, cpQuery);
        if (r.matches.length === 0) {
          const noMatch =
            lang === "ru"
              ? `С "${cpQuery}" нет открытых долгов.`
              : lang === "en"
              ? `No open debts with "${cpQuery}".`
              : `${cpQuery} bilan ochiq qarz yo'q.`;
          await ctx.reply(noMatch);
          return;
        }

        // Build per-person summary
        const lines: string[] = [];
        const givenFmt = formatAmount(r.givenRemaining, lang);
        const takenFmt = formatAmount(r.takenRemaining, lang);

        if (lang === "ru") {
          if (r.givenRemaining > 0n) lines.push(`💰 ${cpQuery} вам должен: ${givenFmt}`);
          if (r.takenRemaining > 0n) lines.push(`💸 Вы должны ${cpQuery}: ${takenFmt}`);
        } else if (lang === "en") {
          if (r.givenRemaining > 0n) lines.push(`💰 ${cpQuery} owes you: ${givenFmt}`);
          if (r.takenRemaining > 0n) lines.push(`💸 You owe ${cpQuery}: ${takenFmt}`);
        } else {
          if (r.givenRemaining > 0n) lines.push(`💰 ${cpQuery} sizga qarzdor: ${givenFmt}`);
          if (r.takenRemaining > 0n) lines.push(`💸 Siz ${cpQuery}ga qarzdorsiz: ${takenFmt}`);
        }

        // Single-figure net → use phraseAnswer; multi-line → template
        const hasGiven = r.givenRemaining > 0n;
        const hasTaken = r.takenRemaining > 0n;
        if (hasGiven !== hasTaken) {
          // Exactly one direction — single figure
          const singleFmt = hasGiven ? givenFmt : takenFmt;
          const fallback = lines.join("\n");
          await replyNatural(
            (t) => ctx.reply(t),
            text,
            lang,
            `debt with ${cpQuery}`,
            [singleFmt],
            fallback
          );
        } else {
          // Both directions or both zero — template
          await ctx.reply(lines.join("\n"));
        }
        return;
      }

      const dirFilter = intentAny.debt_direction as "given" | "taken" | null | undefined ?? null;

      // Fetch totals + open debts (optionally filtered by direction)
      const totals = await getDebtTotals(user.id);
      const debtFilter: { direction?: DebtDirection; status?: DebtStatus } = {
        status: DebtStatus.open,
      };
      if (dirFilter === "given") debtFilter.direction = DebtDirection.given;
      else if (dirFilter === "taken") debtFilter.direction = DebtDirection.taken;

      const openDebts = await listDebts(user.id, debtFilter);

      // Cap list at 10 items
      const MAX_LIST = 10;
      const shown = openDebts.slice(0, MAX_LIST);
      const extra = openDebts.length - shown.length;

      // ── Build localized reply ──────────────────────────────────────────────
      const lines: string[] = [];

      if (lang === "ru") {
        // Totals section
        if (dirFilter === null || dirFilter === "taken") {
          lines.push(`💸 Вы должны (взяли): ${formatAmount(totals.takenOpen, lang)}`);
        }
        if (dirFilter === null || dirFilter === "given") {
          lines.push(`💰 Вам должны (дали): ${formatAmount(totals.givenOpen, lang)}`);
        }

        if (openDebts.length === 0) {
          lines.push("\nОткрытых долгов нет.");
        } else {
          lines.push("");
          for (const d of shown) {
            const arrow = d.direction === DebtDirection.given ? "↗️" : "↙️";
            const dir = d.direction === DebtDirection.given ? "вы дали" : "вы взяли";
            lines.push(`${arrow} ${d.counterparty} — ${formatAmount(d.amountUzs, lang)} (${dir})`);
          }
          if (extra > 0) lines.push(`...и ещё ${extra}`);
        }
      } else if (lang === "en") {
        if (dirFilter === null || dirFilter === "taken") {
          lines.push(`💸 You owe (borrowed): ${formatAmount(totals.takenOpen, lang)}`);
        }
        if (dirFilter === null || dirFilter === "given") {
          lines.push(`💰 Owed to you (lent): ${formatAmount(totals.givenOpen, lang)}`);
        }

        if (openDebts.length === 0) {
          lines.push("\nNo open debts.");
        } else {
          lines.push("");
          for (const d of shown) {
            const arrow = d.direction === DebtDirection.given ? "↗️" : "↙️";
            const dir = d.direction === DebtDirection.given ? "you lent" : "you borrowed";
            lines.push(`${arrow} ${d.counterparty} — ${formatAmount(d.amountUzs, lang)} (${dir})`);
          }
          if (extra > 0) lines.push(`...and ${extra} more`);
        }
      } else {
        // uz (default)
        if (dirFilter === null || dirFilter === "taken") {
          lines.push(`💸 Sizning qarzingiz (olgan): ${formatAmount(totals.takenOpen, lang)}`);
        }
        if (dirFilter === null || dirFilter === "given") {
          lines.push(`💰 Sizga qarzdorlar (bergan): ${formatAmount(totals.givenOpen, lang)}`);
        }

        if (openDebts.length === 0) {
          lines.push("\nHozircha ochiq qarz yo'q.");
        } else {
          lines.push("");
          for (const d of shown) {
            const arrow = d.direction === DebtDirection.given ? "↗️" : "↙️";
            const dir = d.direction === DebtDirection.given ? "siz berdingiz" : "siz oldingiz";
            lines.push(`${arrow} ${d.counterparty} — ${formatAmount(d.amountUzs, lang)} (${dir})`);
          }
          if (extra > 0) lines.push(`...va yana ${extra} ta`);
        }
      }

      await ctx.reply(lines.join("\n"));
    } catch (err) {
      console.error("Debt query error:", err);
      const errMsg =
        lang === "ru"
          ? "Не удалось загрузить долги. Попробуйте ещё раз."
          : lang === "en"
          ? "Could not load debts. Please try again."
          : "Qarzlarni yuklab bo'lmadi. Qaytadan urinib ko'ring.";
      await ctx.reply(errMsg);
    }
    return;
  }

  // ── account_query ─────────────────────────────────────────────────────────
  if (intent.intent === "account_query") {
    try {
      const accountName = (intent as Record<string, unknown>).account_name as string | null | undefined;
      const acctNameStr = accountName?.trim() || null;

      if (!acctNameStr) {
        // No specific account — return total cash on hand
        const accts = await getAccountBalances(user.id);
        if (accts.length === 0) {
          const hint =
            lang === "ru"
              ? "У вас пока нет счетов. Добавьте счёт в приложении."
              : lang === "en"
              ? "You have no accounts yet. Add one in the app."
              : "Hozircha hisobingiz yo'q. Ilovada hisob qo'shing.";
          await ctx.reply(hint);
          return;
        }
        const total = await getCashOnHand(user.id);
        const totalFmt = formatAmount(total, lang);
        const fallbackTotal =
          lang === "ru"
            ? `У вас всего: ${totalFmt}`
            : lang === "en"
            ? `You have a total of: ${totalFmt}`
            : `Sizda jami ${totalFmt} bor`;
        await replyNatural(
          (t) => ctx.reply(t),
          text,
          lang,
          "cash on hand",
          [totalFmt],
          fallbackTotal
        );
        return;
      }

      // Specific account requested
      const accts = await getAccountBalances(user.id);
      if (accts.length === 0) {
        const noAcct =
          lang === "ru"
            ? "У вас пока нет счетов. Добавьте счёт в приложении."
            : lang === "en"
            ? "You have no accounts yet. Add one in the app."
            : "Hozircha hisobingiz yo'q. Ilovada hisob qo'shing.";
        await ctx.reply(noAcct);
        return;
      }

      const m = matchAccountByName(
        accts.map((a) => ({ id: a.id, name: a.name })),
        acctNameStr
      );

      if (m.status === "none") {
        const names = accts.map((a) => a.name).join(", ");
        const notFound =
          lang === "ru"
            ? `Счёт «${acctNameStr}» не найден. Ваши счета: ${names}.`
            : lang === "en"
            ? `Account "${acctNameStr}" not found. Your accounts: ${names}.`
            : `"${acctNameStr}" nomli hisob topilmadi. Sizning hisoblaringiz: ${names}.`;
        await ctx.reply(notFound);
        return;
      }

      if (m.status === "many") {
        const lines = m.matches.map((ma) => {
          const found = accts.find((a) => a.id === ma.id);
          const bal = found ? formatAmount(found.balance, lang) : "?";
          return `• ${ma.name}: ${bal}`;
        });
        const header =
          lang === "ru"
            ? `Найдено несколько счетов:\n`
            : lang === "en"
            ? `Found multiple accounts:\n`
            : `Bir nechta hisob topildi:\n`;
        const ask =
          lang === "ru"
            ? `\nУточните, какой именно счёт вас интересует.`
            : lang === "en"
            ? `\nPlease clarify which account you mean.`
            : `\nQaysi hisobni nazarda tutgansiz?`;
        await ctx.reply(header + lines.join("\n") + ask);
        return;
      }

      // Exactly one match
      const matched = m.matches[0];
      const found = accts.find((a) => a.id === matched.id);
      const bal = found ? found.balance : 0n;
      const balFmt = formatAmount(bal, lang);
      const fallbackOne =
        lang === "ru"
          ? `На счёте «${matched.name}»: ${balFmt}`
          : lang === "en"
          ? `Account "${matched.name}": ${balFmt}`
          : `${matched.name}da ${balFmt} bor`;
      await replyNatural(
        (t) => ctx.reply(t),
        text,
        lang,
        `account balance for ${matched.name}`,
        [balFmt],
        fallbackOne
      );
      return;
    } catch (err) {
      console.error("Account query error:", err);
      const errMsg =
        lang === "ru"
          ? "Не удалось загрузить баланс. Попробуйте ещё раз."
          : lang === "en"
          ? "Could not load balance. Please try again."
          : "Balansni yuklab bo'lmadi. Qaytadan urinib ko'ring.";
      await ctx.reply(errMsg);
    }
    return;
  }

  // ── finance_query ─────────────────────────────────────────────────────────
  if (intent.intent === "finance_query") {
    if (!intent.query) {
      await ctx.reply(intent.reply_text);
      return;
    }
    try {
      const query = intent.query as Omit<FinanceQuery, "metric"> & {
        metric: "sum" | "count" | "avg" | "net" | "breakdown" | "report" | "top";
        compareToPrevious?: boolean;
        limit?: number | null;
      };

      // Branch 1: compareToPrevious — structured result, reply as template
      if (query.compareToPrevious === true) {
        const c = await compareSpend(user.id, {
          type: query.type ?? undefined,
          period: query.period,
          language: lang,
        });
        await ctx.reply(c.text);
        return;
      }

      // Branch 2: top transactions
      if (query.metric === "top") {
        const rows = await topTransactions(user.id, {
          type: query.type ?? undefined,
          period: query.period,
          limit: query.limit ?? 5,
        });

        if (rows.length === 0) {
          const empty =
            lang === "ru"
              ? "За этот период записей нет."
              : lang === "en"
              ? "No records for this period."
              : "Bu davrda yozuv yo'q.";
          await ctx.reply(empty);
          return;
        }

        const header =
          lang === "ru"
            ? `Топ транзакций:\n`
            : lang === "en"
            ? `Top transactions:\n`
            : `Eng katta tranzaksiyalar:\n`;

        const lines = rows.map((r, i) => {
          const amtFmt = formatAmount(r.amountUzs, lang);
          const label = r.category ?? r.note ?? (lang === "ru" ? "без категории" : lang === "en" ? "no category" : "kategoriyasiz");
          // Format date as YYYY-MM-DD in Tashkent
          const tzDate = new Date(r.occurredAt.getTime() + 5 * 60 * 60 * 1000);
          const yy = tzDate.getUTCFullYear();
          const mm = String(tzDate.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(tzDate.getUTCDate()).padStart(2, "0");
          const dateStr = `${yy}-${mm}-${dd}`;
          return `  ${i + 1}. ${amtFmt} — ${label} (${dateStr})`;
        });

        await ctx.reply(header + lines.join("\n"));
        return;
      }

      // Branch 3: default aggregation path
      const result = await runAggregation(
        user.id,
        query as FinanceQuery,
        lang
      );

      // Single-figure plain sum (no groupBy) → wrap through phraseAnswer
      if (
        query.metric === "sum" &&
        !query.groupBy &&
        typeof result.data?.sum === "string"
      ) {
        const sumFmt = formatAmount(BigInt(result.data.sum as string), lang);
        await replyNatural(
          (t) => ctx.reply(t),
          text,
          lang,
          "period spend",
          [sumFmt],
          result.text
        );
        return;
      }

      // All other metrics: reply with deterministic template text
      await ctx.reply(result.text);
    } catch (err) {
      console.error("Analytics error:", err);
      const errMsg =
        lang === "ru"
          ? "Не удалось выполнить запрос. Попробуйте ещё раз."
          : lang === "en"
          ? "Could not run query. Please try again."
          : "So'rov bajarilmadi. Qaytadan urinib ko'ring.";
      await ctx.reply(errMsg);
    }
    return;
  }

  // ── correct_transaction ───────────────────────────────────────────────────
  if (intent.intent === "correct_transaction") {
    const patch = intent.patch;
    if (!patch) {
      await ctx.reply(intent.reply_text);
      return;
    }

    try {
      // ── Targeted lookup: score recent transactions if brain provided targeting ─
      const intentAny = intent as Record<string, unknown>;
      const targetMode = intentAny.target as string | null | undefined;
      const targetAmount = intentAny.targetAmount as number | null | undefined;
      const targetHint = intentAny.targetHint as string | null | undefined;

      let targetTxId: string | null = null;

      const useTargeting =
        targetMode === "by_amount" ||
        (targetAmount != null && targetAmount > 0) ||
        (typeof targetHint === "string" && targetHint.trim().length > 0);

      if (useTargeting) {
        // Fetch up to 50 most-recent non-deleted transactions with their category
        const recent = await prisma.transaction.findMany({
          where: { userId: user.id, deletedAt: null },
          orderBy: { occurredAt: "desc" },
          take: 50,
          include: { category: true },
        });

        let bestScore = 0;
        let bestId: string | null = null;

        for (const tx of recent) {
          let score = 0;
          // +2 for exact amount match (BigInt comparison)
          if (targetAmount != null && tx.amountUzs === BigInt(targetAmount)) {
            score += 2;
          }
          // +1 for category or note containing the hint (case-insensitive substring)
          if (typeof targetHint === "string" && targetHint.trim().length > 0) {
            const hint = targetHint.toLowerCase();
            const catName = (tx.category?.name ?? "").toLowerCase();
            const noteTxt = (tx.note ?? "").toLowerCase();
            if (catName.includes(hint) || noteTxt.includes(hint)) {
              score += 1;
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestId = tx.id;
          }
        }

        if (bestScore > 0 && bestId) {
          targetTxId = bestId;
        }
        // If nothing scored, fall through to lastTransactionId fallback below
      }

      // ── Fallback: lastTransactionId from pending action ────────────────────
      if (!targetTxId) {
        const activePending = await getPendingAction(user.id);
        const lastTxId =
          activePending?.lastTransactionId ??
          ((activePending?.draft as Record<string, unknown>)?.lastTransactionId as string | undefined);
        if (lastTxId) {
          targetTxId = lastTxId;
        }
      }

      // ── Final fallback: most-recent transaction ───────────────────────────
      if (!targetTxId) {
        const mostRecent = await prisma.transaction.findFirst({
          where: { userId: user.id, deletedAt: null },
          orderBy: { occurredAt: "desc" },
          select: { id: true },
        });
        if (mostRecent) {
          targetTxId = mostRecent.id;
        }
      }

      if (!targetTxId) {
        const noTx =
          lang === "ru"
            ? "Нет недавней транзакции для исправления."
            : lang === "en"
            ? "No recent transaction to correct."
            : "Tuzatish uchun yaqin tranzaksiya yo'q.";
        await ctx.reply(noTx);
        return;
      }

      const tx = await prisma.transaction.findFirst({
        where: { id: targetTxId, userId: user.id, deletedAt: null },
        include: { category: true },
      });
      if (!tx) {
        const notFound =
          lang === "ru" ? "Транзакция не найдена." : lang === "en" ? "Transaction not found." : "Tranzaksiya topilmadi.";
        await ctx.reply(notFound);
        return;
      }

      // Remember previous state for the confirmation message
      const prevAmount = tx.amountUzs;
      const prevCategoryName = tx.category?.name ?? null;

      let newCategoryId: string | undefined = undefined;
      if (patch.category) {
        const patchTxType = patch.type
          ? patch.type === "income" ? TxType.income : TxType.expense
          : tx.type;
        newCategoryId = await resolveOrCreateCategory(user.id, patch.category, patchTxType);
      }

      const updated = await prisma.transaction.update({
        where: { id: targetTxId },
        data: {
          ...(patch.amount ? { amountUzs: BigInt(patch.amount) } : {}),
          ...(patch.type ? { type: patch.type === "income" ? TxType.income : TxType.expense } : {}),
          ...(newCategoryId !== undefined ? { categoryId: newCategoryId } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
        },
        include: { category: true },
      });

      // Build a "which transaction was corrected" context line for the user
      const prevAmtStr = formatAmount(prevAmount, lang);
      const prevCatPart = prevCategoryName
        ? (lang === "ru" ? `, ${prevCategoryName}` : lang === "en" ? `, ${prevCategoryName}` : `, ${prevCategoryName}`)
        : "";
      const wasStr =
        lang === "ru"
          ? `(было: ${prevAmtStr}${prevCatPart})`
          : lang === "en"
          ? `(was: ${prevAmtStr}${prevCatPart})`
          : `(avval: ${prevAmtStr}${prevCatPart})`;

      const confirmation = formatConfirmation({
        amount: updated.amountUzs,
        type: updated.type,
        categoryName: updated.category?.name ?? null,
        date: "today",
        language: lang,
      });
      const prefix =
        lang === "ru" ? "✏️ Исправлено: " : lang === "en" ? "✏️ Updated: " : "✏️ Tuzatildi: ";
      await ctx.reply(`${prefix}${confirmation.replace(/^✅ /, "")} ${wasStr}`);
    } catch (err) {
      console.error("correct_transaction error:", err);
      await ctx.reply(intent.reply_text);
    }
    return;
  }

  // ── delete_transaction ────────────────────────────────────────────────────
  if (intent.intent === "delete_transaction") {
    const activePending2 = await getPendingAction(user.id);
    const lastTxId2 =
      activePending2?.lastTransactionId ??
      ((activePending2?.draft as Record<string, unknown>)?.lastTransactionId as string | undefined);

    if (!lastTxId2) {
      const noTx =
        lang === "ru"
          ? "Нет недавней транзакции для удаления."
          : lang === "en"
          ? "No recent transaction to delete."
          : "O'chirish uchun yaqin tranzaksiya yo'q.";
      await ctx.reply(noTx);
      return;
    }

    try {
      const tx = await prisma.transaction.findFirst({
        where: { id: lastTxId2, userId: user.id, deletedAt: null },
      });
      if (!tx) {
        const notFound =
          lang === "ru" ? "Транзакция не найдена." : lang === "en" ? "Transaction not found." : "Tranzaksiya topilmadi.";
        await ctx.reply(notFound);
        return;
      }

      await prisma.transaction.update({
        where: { id: lastTxId2 },
        data: { deletedAt: new Date() },
      });

      const deleted =
        lang === "ru" ? "🗑️ Удалено." : lang === "en" ? "🗑️ Deleted." : "🗑️ O'chirildi.";
      await ctx.reply(deleted);
    } catch (err) {
      console.error("delete_transaction error:", err);
      await ctx.reply(intent.reply_text);
    }
    return;
  }

  // ── add_category ──────────────────────────────────────────────────────────
  if (intent.intent === "add_category") {
    const catName = intent.category;
    const catType = intent.type;
    if (!catName || !catType) {
      const ask =
        lang === "ru"
          ? "Укажите название и тип категории (доход или расход)."
          : lang === "en"
          ? "Please specify category name and type (income or expense)."
          : "Kategoriya nomini va turini (kirim yoki chiqim) yozing.";
      await ctx.reply(ask);
      return;
    }

    try {
      const txType = catType === "income" ? TxType.income : TxType.expense;
      const catId = await resolveOrCreateCategory(user.id, catName, txType);
      const cat = await prisma.category.findUnique({ where: { id: catId } });
      const confirm =
        lang === "ru"
          ? `✅ Категория "${cat?.name}" добавлена.`
          : lang === "en"
          ? `✅ Category "${cat?.name}" added.`
          : `✅ "${cat?.name}" kategoriyasi qo'shildi.`;
      await ctx.reply(confirm);
    } catch (err) {
      console.error("add_category error:", err);
      await ctx.reply(intent.reply_text);
    }
    return;
  }

  // ── unknown (A3: append /help hint) ──────────────────────────────────────
  const unknownBase =
    intent.reply_text ||
    (lang === "ru"
      ? "Не понял. Напишите о доходе или расходе."
      : lang === "en"
      ? "I didn't understand. Write about income or expense."
      : "Tushunmadim. Kirim yoki chiqim haqida yozing.");
  const helpHint =
    lang === "ru"
      ? '\n💡 Подсказка: /help — список команд. Например: "На обед 35 000 сум".'
      : lang === "en"
      ? '\n💡 Tip: /help — command list. E.g. "35 000 for lunch".'
      : '\n💡 Maslahat: /help — buyruqlar. Masalan: "Tushlikka 35 000 so\'m".';
  await ctx.reply(unknownBase + helpHint);
}

// ── Bot factory ───────────────────────────────────────────────────────────────

export function createBot(): Bot {
  const env = getEnv();
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const prisma = db as import("@prisma/client").PrismaClient;

  // Global error handler
  bot.catch(async (err) => {
    console.error("Bot error while handling update:", err.error);
    // Alert the owner about the failure — best-effort, throttled, never throws.
    await notifyOwnerError(err.ctx.api, "bot.catch", err.error);
    try {
      const fromId = err.ctx.from?.id;
      let catchLang: "uz" | "ru" | "en" = "uz";
      if (fromId) {
        try {
          const catchUser = await prisma.user.findUnique({
            where: { telegramId: BigInt(fromId) },
            select: { language: true },
          });
          catchLang = (catchUser?.language as "uz" | "ru" | "en") ?? "uz";
        } catch { /* ignore — use default */ }
      }
      await err.ctx.reply(getBotLabels(catchLang).botErrorMsg);
    } catch {
      // swallow
    }
  });

  // Localized welcome shown after the user picks a language.
  const welcomeText = (l: "uz" | "ru" | "en", name: string): string => {
    if (l === "ru") {
      return `Привет, ${name}! 👋\n\nOson Moliya — бот для учёта финансов вашего бизнеса.\n\n✍️ Пишите расход/доход ПРЯМО СЮДА или 🎤 наговорите — я запишу. Например:\n• "500 тысяч продажа"\n• "150 тысяч логистика расход"\n• "покажи отчёт за этот месяц"\n\n📊 Кнопка "Moliyachi" — только для ПРОСМОТРА отчётов и графиков (туда писать не нужно).\n\nУже пользовались? /kirish`;
    }
    if (l === "en") {
      return `Hi, ${name}! 👋\n\nOson Moliya — a bot to track your business finances.\n\n✍️ Log an expense/income RIGHT HERE or 🎤 by voice — I'll record it. For example:\n• "500 thousand sales"\n• "150 thousand logistics expense"\n• "show this month's report"\n\n📊 The "Moliyachi" button just opens your dashboard to VIEW reports — no need to type there.\n\nUsed this before? /kirish`;
    }
    return `Salom, ${name}! 👋\n\nOson Moliya — biznesingiz moliyasini kuzatish uchun bot.\n\n✍️ Xarajat/daromadni SHU YERGA yozing yoki 🎤 ayting — men qayd qilaman. Masalan:\n• "500 ming sotuv"\n• "150 ming logistika chiqim"\n• "shu oyni hisobot ko'rsat"\n\n📊 "Moliyachi" tugmasi — faqat hisobot va grafiklarni KO'RISH uchun (u yerga yozish shart emas).\n\nAvval foydalanganmisiz? /kirish`;
  };

  // loginAccessText + buildLoginAccessReply are now module-level (defined above createBot)
  // so handleMessage's 📈 Grafik handler can also call them.

  // /start handler
  bot.command("start", async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const existing = await prisma.user.findUnique({
      where: { telegramId: BigInt(from.id) },
      select: { id: true },
    });

    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(from.id) },
      create: {
        telegramId: BigInt(from.id),
        firstName: from.first_name ?? null,
        username: from.username ?? null,
        language: "uz",
      },
      update: {
        firstName: from.first_name ?? null,
        username: from.username ?? null,
      },
    });

    await ensureDefaultCategories(user.id);

    // First time only → ask to choose language. Returning users go straight in.
    if (!existing) {
      await ctx.reply("Tilni tanlang / Выберите язык / Choose your language:", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🇺🇿 O'zbekcha", callback_data: "lang:uz" },
              { text: "🇷🇺 Русский", callback_data: "lang:ru" },
              { text: "🇬🇧 English", callback_data: "lang:en" },
            ],
          ],
        },
      });
      return;
    }

    const lang = (user.language as "uz" | "ru" | "en") ?? "uz";
    const startPayload = typeof ctx.match === "string" ? ctx.match.trim().toLowerCase() : "";
    if (startPayload === "login") {
      const access = await buildLoginAccessReply(user.id, lang);
      await ctx.reply(access.text, { reply_markup: access.reply_markup });
      return;
    }

    const name =
      from.first_name ?? (lang === "ru" ? "друг" : lang === "en" ? "friend" : "Do'stim");
    const dashStart = await dashboardReplyOptions(user.id);
    const env = getEnv();
    const kb = buildPersistentKeyboard(lang, env.APP_URL);
    await ctx.reply(welcomeText(lang, name) + dashStart.extraText, {
      reply_markup: kb,
    });
  });

  // /dashboard and /login — issue a fresh dashboard magic-link
  bot.command(["dashboard", "login"], async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(from.id) },
      create: {
        telegramId: BigInt(from.id),
        firstName: from.first_name ?? null,
        username: from.username ?? null,
        language: "uz",
      },
      update: {
        firstName: from.first_name ?? null,
        username: from.username ?? null,
      },
    });
    await ensureDefaultCategories(user.id);
    const lang = (user.language as "uz" | "ru" | "en") ?? "uz";
    const access = await buildLoginAccessReply(user.id, lang);
    await ctx.reply(access.text, { reply_markup: access.reply_markup });
  });

  // /help + /yordam — command list + examples (yordam = Uzbek alias)
  bot.command(["help", "yordam"], async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const u = await prisma.user.findUnique({
      where: { telegramId: BigInt(from.id) },
      select: { language: true },
    });
    const lang = (u?.language as "uz" | "ru" | "en") ?? "uz";
    await ctx.reply(helpText(lang), { reply_markup: helpInlineKeyboard(lang) });
  });

  // /feedback — ask user to write a message that is forwarded to the owner
  bot.command("feedback", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const u = await prisma.user.findUnique({
      where: { telegramId: BigInt(from.id) },
      select: { id: true, language: true },
    });
    const lang = (u?.language as "uz" | "ru" | "en") ?? "uz";
    if (u) {
      await upsertPendingAction(u.id, { intent: "feedback", draft: {}, question: "" });
    }
    const prompt =
      lang === "ru"
        ? "✍️ Напишите ваш отзыв или вопрос — он дойдёт прямо до команды.\n\n(Ru / En / Uz — любой язык)"
        : lang === "en"
        ? "✍️ Write your feedback or question — it goes straight to the team.\n\n(Uz / Ru / En — any language)"
        : "✍️ Fikr yoki muammoyingizni yozing — to'g'ridan-to'g'ri jamoaga yetadi.\n\n(Uz / Ru / En — istalgan tilda)";
    await ctx.reply(prompt, { reply_markup: { force_reply: true } });
  });

  // /kirish — recovery entry point for returning users (password-based login on the web)
  bot.command("kirish", async (ctx) => {
    if (!ctx.from) return;
    const env = getEnv();
    // Use the existing APP_URL — same source as buildLoginAccessReply / dashboardReplyOptions.
    const loginUrl = `${env.APP_URL}/login`;
    const u = await prisma.user.findUnique({
      where: { telegramId: BigInt(ctx.from.id) },
      select: { language: true },
    });
    const lang = (u?.language as "uz" | "ru" | "en") ?? "uz";
    const msg =
      lang === "ru"
        ? `🔑 Если вы уже пользовались ботом, войдите на сайт по логину и паролю:\n${loginUrl}\n\nВсе ваши данные там. Забыли пароль? Напишите /feedback.`
        : lang === "en"
        ? `🔑 If you've used the bot before, log in with your login and password:\n${loginUrl}\n\nAll your data is there. Forgot your password? Use /feedback.`
        : `🔑 Avval foydalangan bo'lsangiz, saytga login va parolingiz bilan kiring:\n${loginUrl}\n\nBarcha ma'lumotingiz o'sha yerda. Parolni unutsangiz — /feedback orqali yozing.`;
    await ctx.reply(msg);
  });

  // /hisobot, /report, /otchet — send a styled monthly Excel report as a document
  // NOTE: add /hisobot to setMyCommands via BotFather to show it in the command menu.
  bot.command(["hisobot", "report", "otchet"], async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    // Resolve user (same upsert pattern used everywhere in the bot)
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(from.id) },
      create: {
        telegramId: BigInt(from.id),
        firstName: from.first_name ?? null,
        username: from.username ?? null,
        language: "uz",
      },
      update: {},
    });

    const lang = (user.language as "uz" | "ru" | "en") ?? "uz";

    // Light abuse guard — reuse the existing in-memory rate limiter.
    // This is a DB + file-build op (no AI), so the 20/10-min cap is generous.
    if (isRateLimited(from.id)) {
      await ctx.reply(
        lang === "ru"
          ? "⏳ Подождите немного и попробуйте снова."
          : lang === "en"
          ? "⏳ Please wait a moment and try again."
          : "⏳ Biroz kuting va qaytadan urinib ko'ring."
      );
      return;
    }

    // A1: delegate to module-level helper (shared with keyword path in handleMessage)
    await ctx.replyWithChatAction("upload_document");
    await buildAndSendReport(
      (t) => ctx.reply(t),
      (file, opts) => ctx.replyWithDocument(file, opts),
      prisma,
      user,
      lang
    );
  });

  // /language + /til — re-open the language picker any time (til = Uzbek alias)
  bot.command(["language", "til"], async (ctx) => {
    if (!ctx.from) return;
    await ctx.reply("Tilni tanlang / Выберите язык / Choose your language:", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🇺🇿 O'zbekcha", callback_data: "lang:uz" },
            { text: "🇷🇺 Русский", callback_data: "lang:ru" },
            { text: "🇬🇧 English", callback_data: "lang:en" },
          ],
        ],
      },
    });
  });

  // Text message handler
  bot.on("message:text", async (ctx) => {
    if (!ctx.from) return;
    // ── Feature A: owner can reply to forwarded feedback messages ────────────
    // If the sender is the owner AND the message is a reply to a forwarded
    // feedback message, extract the original user's Telegram id from the
    // forwarded text and relay the reply back to them.
    if (
      ctx.from.id === FEEDBACK_CHAT_ID &&
      ctx.message.reply_to_message &&
      typeof (ctx.message.reply_to_message as { text?: string }).text === "string"
    ) {
      const repliedText = (ctx.message.reply_to_message as { text?: string }).text ?? "";
      const idMatch = repliedText.match(/id (\d+)\)/);
      if (idMatch) {
        const targetUserId = parseInt(idMatch[1], 10);
        try {
          await ctx.api.sendMessage(
            targetUserId,
            "💬 Jamoadan javob:\n\n" + ctx.message.text
          );
          await ctx.reply("✅ Javob yuborildi.");
        } catch (relayErr) {
          console.error("owner relay error:", relayErr);
          await ctx.reply("❌ Yetkazib bo'lmadi.");
        }
        return; // do NOT run handleMessage — owner's reply must not be logged
      }
      // If no id found in the replied text, fall through to normal handleMessage
    }
    // Rate limit check before brain call
    if (isRateLimited(ctx.from.id)) {
      const rlUser = await prisma.user.findUnique({ where: { telegramId: BigInt(ctx.from.id) }, select: { language: true } });
      const rlLang = (rlUser?.language as "uz" | "ru" | "en") ?? "uz";
      await ctx.reply(getBotLabels(rlLang).rateLimitMsg);
      return;
    }
    // "Typing…" indicator while the brain processes the text (native Telegram action;
    // never block logging if it fails). Auto-clears when the reply is sent.
    await ctx.replyWithChatAction("typing").catch(() => {});
    await handleMessage(
      {
        from: ctx.from,
        reply: (text, opts) => ctx.reply(text, opts),
        // A1: pass replyWithDocument so keyword handler can send Excel
        replyWithDocument: (file, opts) => ctx.replyWithDocument(file, opts),
        api: ctx.api,
      },
      ctx.message.text,
      prisma
    );
  });

  // Voice message handler (Phase 2)
  bot.on("message:voice", async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    // Voice size cap (R4): reject overly long/large audio before downloading
    const voice = ctx.message.voice;
    if (voice.duration > 60 || (voice.file_size !== undefined && voice.file_size > 5 * 1024 * 1024)) {
      const vlUser = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) }, select: { language: true } });
      const vlLang = (vlUser?.language as "uz" | "ru" | "en") ?? "uz";
      await ctx.reply(getBotLabels(vlLang).audioTooLongMsg);
      return;
    }

    // Rate limit check before STT + brain
    if (isRateLimited(from.id)) {
      const vlrlUser = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) }, select: { language: true } });
      const vlrlLang = (vlrlUser?.language as "uz" | "ru" | "en") ?? "uz";
      await ctx.reply(getBotLabels(vlrlLang).rateLimitMsg);
      return;
    }

    try {
      // Show typing indicator while transcribing
      await ctx.replyWithChatAction("typing");

      // Resolve user's account language BEFORE transcribing so Whisper receives
      // the correct language hint (prevents Uzbek → Turkish mis-detection).
      const voiceUser = await prisma.user.upsert({
        where: { telegramId: BigInt(from.id) },
        create: {
          telegramId: BigInt(from.id),
          firstName: from.first_name ?? null,
          username: from.username ?? null,
          language: "uz",
        },
        update: {
          firstName: from.first_name ?? null,
          username: from.username ?? null,
        },
      });
      const voiceLang = (voiceUser.language ?? "uz") as "uz" | "ru" | "en";

      // Persistent daily cap for costly ops (voice/audio/photo)
      const voiceToday = getTashkentNow().toISOString().slice(0, 10);
      const voiceVerdict = evalCostlyCap(
        { ymd: voiceUser.costlyOpsYmd, count: voiceUser.costlyOpsCount },
        voiceToday
      );
      if (!voiceVerdict.allowed) {
        await ctx.reply(getBotLabels(voiceLang).costlyLimitMsg);
        return;
      }
      await prisma.user.update({
        where: { id: voiceUser.id },
        data: { costlyOpsYmd: voiceVerdict.next.ymd, costlyOpsCount: voiceVerdict.next.count },
      });

      const fileInfo = await ctx.api.getFile(voice.file_id);
      if (!fileInfo.file_path) {
        await ctx.reply(getBotLabels(voiceLang).voiceDownloadErrMsg);
        return;
      }

      const audioBuffer = await downloadTelegramFile(fileInfo.file_path);
      const stt = getSttProvider();
      // Telegram voice is OGG/Opus. Groq accepts .ogg/.opus but NOT ".oga" → use ".ogg".
      const transcript = await stt.transcribe(audioBuffer, "voice.ogg", { language: voiceLang });

      // (No raw-transcript echo — the user only sees the parsed confirmation card.)

      // Feed into the same brain path as text (A1: replyWithDocument for keyword path)
      await handleMessage(
        {
          from,
          reply: (text, opts) => ctx.reply(text, opts),
          replyWithDocument: (file, opts) => ctx.replyWithDocument(file, opts),
          api: ctx.api,
        },
        transcript,
        prisma
      );
    } catch (err) {
      console.error("Voice handling error:", err);
      const verrUser = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) }, select: { language: true } });
      const verrLang = (verrUser?.language as "uz" | "ru" | "en") ?? "uz";
      await ctx.reply(getBotLabels(verrLang).voiceTranscribeErrMsg);
    }
  });

  // ── Inline keyboard callback handler ─────────────────────────────────────
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const from = ctx.from;

    try {
      if (!from) {
        await ctx.answerCallbackQuery();
        return;
      }

      // Resolve user (same upsert pattern as elsewhere)
      const user = await prisma.user.upsert({
        where: { telegramId: BigInt(from.id) },
        create: {
          telegramId: BigInt(from.id),
          firstName: from.first_name ?? null,
          username: from.username ?? null,
          language: "uz",
        },
        update: {
          firstName: from.first_name ?? null,
          username: from.username ?? null,
        },
      });

      const lang = (user.language as "uz" | "ru" | "en") ?? "uz";
      const labels = getBotLabels(lang);

      // ── lang:uz / lang:ru / lang:en — set the bot's reply language ─────────
      if (data === "lang:uz" || data === "lang:ru" || data === "lang:en") {
        const chosen = data.slice(5) as "uz" | "ru" | "en";
        await prisma.user.update({
          where: { id: user.id },
          data: { language: chosen },
        });
        await ctx.answerCallbackQuery();
        const name =
          from.first_name ?? (chosen === "ru" ? "друг" : chosen === "en" ? "friend" : "Do'stim");
        const langEnv = getEnv();
        const langKb = buildPersistentKeyboard(chosen, langEnv.APP_URL);
        await ctx.reply(welcomeText(chosen, name), {
          reply_markup: langKb,
        });
        return;
      }

      // ── lang:pick — re-show the language picker (change language later) ────
      if (data === "lang:pick") {
        await ctx.answerCallbackQuery();
        await ctx.reply("Tilni tanlang / Выберите язык / Choose your language:", {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🇺🇿 O'zbekcha", callback_data: "lang:uz" },
                { text: "🇷🇺 Русский", callback_data: "lang:ru" },
                { text: "🇬🇧 English", callback_data: "lang:en" },
              ],
            ],
          },
        });
        return;
      }

      // ── t:income / t:expense — complete a type-clarify pending action ──────
      if (data === "t:income" || data === "t:expense") {
        const pending = await getPendingAction(user.id);
        if (!pending || pending.intent !== "clarify_needed") {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }

        const draft = pending.draft as Record<string, unknown>;
        const amount = draft.amount as number | undefined;
        if (!amount || amount <= 0) {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }

        const txType: TxType = data === "t:income" ? TxType.income : TxType.expense;
        const category = draft.category as string | undefined;
        const dateStr = (draft.date as string | undefined) ?? "today";
        const note = draft.note as string | undefined;

        await ctx.answerCallbackQuery();
        await finalizeLog(
          { reply: (text, opts) => ctx.reply(text, opts) },
          user,
          prisma,
          { amount, txType, category, dateStr, note },
          lang
        );
        return;
      }

      // ── d:<txId> — show delete confirmation row ───────────────────────────
      if (data.startsWith("d:") && !data.startsWith("dy:") && !data.startsWith("dn")) {
        const txId = data.slice(2);
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru"
            ? `Удалить эту транзакцию?`
            : lang === "en"
            ? `Delete this transaction?`
            : `Bu tranzaksiyani o'chirasizmi?`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: labels.confirmDeleteBtn, callback_data: `dy:${txId}` },
                { text: labels.cancelBtn, callback_data: "dn" },
              ]],
            },
          }
        );
        return;
      }

      // ── dy:<txId> — confirmed soft-delete ────────────────────────────────
      if (data.startsWith("dy:")) {
        const txId = data.slice(3);
        const tx = await prisma.transaction.findFirst({
          where: { id: txId, userId: user.id, deletedAt: null },
        });
        if (!tx) {
          await ctx.answerCallbackQuery({ text: labels.notFoundMsg });
          await ctx.reply(labels.notFoundMsg);
          return;
        }
        await prisma.transaction.update({
          where: { id: txId, userId: user.id },
          data: { deletedAt: new Date() },
        });
        await ctx.answerCallbackQuery({ text: labels.deletedMsg });
        await ctx.reply(labels.deletedMsg);
        return;
      }

      // ── dn — cancel (dismiss) ─────────────────────────────────────────────
      if (data === "dn") {
        await ctx.answerCallbackQuery({ text: labels.cancelledMsg });
        return;
      }

      // ── e:<txId> — open ONE consolidated edit window (one tap to fix) ─────
      if (data.startsWith("e:")) {
        const txId = data.slice(2);
        const tx = await prisma.transaction.findFirst({
          where: { id: txId, userId: user.id, deletedAt: null },
          select: { id: true, type: true, note: true, amountUzs: true, category: { select: { name: true } } },
        });
        if (!tx) {
          await ctx.answerCallbackQuery({ text: labels.notFoundMsg });
          await ctx.reply(labels.notFoundMsg);
          return;
        }
        await clearPendingAction(user.id);
        await upsertPendingAction(user.id, { intent: "edit_tx", draft: { txId }, question: "" });

        // One window: category pills (2-per-row) + amount/delete — type-flip lives on the card only.
        const editCats = await getSmartCategories(user.id, tx.type, tx.note ?? null, 6);
        const rows: InlineKeyboardButton[][] = [];
        const catBtns: InlineKeyboardButton[] = editCats.map((c) => ({ text: c.name, callback_data: `ec:${c.id}` }));
        for (let i = 0; i < catBtns.length; i += 2) rows.push(catBtns.slice(i, i + 2));
        rows.push([
          { text: lang === "ru" ? "✏️ Другое" : lang === "en" ? "✏️ Other" : "✏️ Boshqa", callback_data: `ec:other:${txId}` },
        ]);
        rows.push([
          { text: labels.editAmountLabel, callback_data: "ef:amt" },
          { text: labels.deleteBtn, callback_data: `d:${txId}` },
        ]);
        const isExpenseEdit = tx.type === TxType.expense;
        const typeIcon = isExpenseEdit ? "🔴" : "🟢";
        const typeWord = isExpenseEdit
          ? (lang === "ru" ? "Расход" : lang === "en" ? "Expense" : "Chiqim")
          : (lang === "ru" ? "Доход" : lang === "en" ? "Income" : "Kirim");
        const catName = tx.category?.name ?? (lang === "ru" ? "—" : lang === "en" ? "—" : "—");
        const amtStr = formatAmount(tx.amountUzs, lang);
        const headerText = editPickerHeader(typeIcon, typeWord, catName, amtStr, lang);
        await ctx.answerCallbackQuery();
        await ctx.reply(
          headerText,
          { reply_markup: { inline_keyboard: rows } }
        );
        return;
      }

      // ── ef:amt — ask for the new amount as a typed reply (covers STT) ─────
      if (data === "ef:amt") {
        const p = await getPendingAction(user.id);
        if (!p || p.intent !== "edit_tx") {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }
        const txId = (p.draft as Record<string, unknown>).txId as string;
        const tx = await prisma.transaction.findFirst({
          where: { id: txId, userId: user.id, deletedAt: null },
          select: { id: true },
        });
        if (!tx) {
          await clearPendingAction(user.id);
          await ctx.answerCallbackQuery({ text: labels.notFoundMsg });
          await ctx.reply(labels.notFoundMsg);
          return;
        }
        await upsertPendingAction(user.id, { intent: "edit_tx", draft: { txId, field: "amount" }, question: "" });
        await ctx.answerCallbackQuery();
        await ctx.reply(
          labels.editAmountPrompt,
          { reply_markup: { force_reply: true, input_field_placeholder: labels.editAmountLabel.replace("💰 ", "") } }
        );
        return;
      }

      // ── ec:other:<txId> — edit: type a custom category name ──────────────
      if (data.startsWith("ec:other:")) {
        const txId = data.slice(9);
        await upsertPendingAction(user.id, {
          intent: "edit_tx",
          draft: { txId, field: "category_text" },
          question: "",
        });
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru" ? "Введите название категории:" : lang === "en" ? "Enter the category name:" : "Kategoriya nomini yozing:",
          { reply_markup: { force_reply: true } }
        );
        return;
      }

      // ── ec:<categoryId> — edit: set the transaction's category ────────────
      if (data.startsWith("ec:")) {
        const catId = data.slice(3);
        const p = await getPendingAction(user.id);
        if (!p || p.intent !== "edit_tx") {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }
        const txId = (p.draft as Record<string, unknown>).txId as string;
        const tx = await prisma.transaction.findFirst({
          where: { id: txId, userId: user.id, deletedAt: null },
          select: { id: true },
        });
        const cat = await prisma.category.findFirst({
          where: { id: catId, userId: user.id },
          select: { id: true },
        });
        if (!tx || !cat) {
          await clearPendingAction(user.id);
          await ctx.answerCallbackQuery({ text: labels.notFoundMsg });
          await ctx.reply(labels.notFoundMsg);
          return;
        }
        await prisma.transaction.update({ where: { id: txId, userId: user.id }, data: { categoryId: catId } });
        await clearPendingAction(user.id);
        await upsertPendingAction(user.id, { intent: "logged", draft: { lastTransactionId: txId }, question: "", lastTransactionId: txId });
        await ctx.answerCallbackQuery();
        await showUpdatedTx({ reply: (t, o) => ctx.reply(t, o) }, prisma, user, txId, lang);
        return;
      }

      // ── et:income / et:expense — edit: set the transaction's type ─────────
      if (data === "et:income" || data === "et:expense") {
        const p = await getPendingAction(user.id);
        if (!p || p.intent !== "edit_tx") {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }
        const txId = (p.draft as Record<string, unknown>).txId as string;
        const tx = await prisma.transaction.findFirst({
          where: { id: txId, userId: user.id, deletedAt: null },
          select: { id: true },
        });
        if (!tx) {
          await clearPendingAction(user.id);
          await ctx.answerCallbackQuery({ text: labels.notFoundMsg });
          await ctx.reply(labels.notFoundMsg);
          return;
        }
        const newType = data === "et:income" ? TxType.income : TxType.expense;
        // Category is type-scoped — clear it so it can't mismatch the new type.
        await prisma.transaction.update({ where: { id: txId, userId: user.id }, data: { type: newType, categoryId: null } });
        await clearPendingAction(user.id);
        await upsertPendingAction(user.id, { intent: "logged", draft: { lastTransactionId: txId }, question: "", lastTransactionId: txId });
        await ctx.answerCallbackQuery();
        await showUpdatedTx({ reply: (t, o) => ctx.reply(t, o) }, prisma, user, txId, lang);
        return;
      }

      // ── ft:<txId> — flip transaction type from the confirmation card ────────
      if (data.startsWith("ft:")) {
        const ftTxId = data.slice(3);
        const ftTx = await prisma.transaction.findFirst({
          where: { id: ftTxId, userId: user.id, deletedAt: null },
          select: { id: true, type: true },
        });
        if (!ftTx) {
          await ctx.answerCallbackQuery({ text: labels.notFoundMsg });
          await ctx.reply(labels.notFoundMsg);
          return;
        }
        const ftNewType = ftTx.type === TxType.expense ? TxType.income : TxType.expense;
        const ftDefaultName = ftNewType === TxType.income ? "boshqa kirim" : "boshqa chiqim";
        // Prefer user's default category for the new type; fall back to first owned category of that type.
        let ftCategoryId: string | null = null;
        const ftDefaultCat = await prisma.category.findFirst({
          where: { userId: user.id, name: ftDefaultName, type: ftNewType },
          select: { id: true },
        });
        if (ftDefaultCat) {
          ftCategoryId = ftDefaultCat.id;
        } else {
          const ftFallbackCat = await prisma.category.findFirst({
            where: { userId: user.id, type: ftNewType },
            select: { id: true },
          });
          ftCategoryId = ftFallbackCat?.id ?? null;
        }
        await prisma.transaction.update({
          where: { id: ftTxId, userId: user.id },
          data: { type: ftNewType, ...(ftCategoryId ? { categoryId: ftCategoryId } : {}) },
        });
        await clearPendingAction(user.id);
        await upsertPendingAction(user.id, { intent: "logged", draft: { lastTransactionId: ftTxId }, question: "", lastTransactionId: ftTxId });
        await ctx.answerCallbackQuery();
        await showUpdatedTx({ reply: (t, o) => ctx.reply(t, o) }, prisma, user, ftTxId, lang);
        return;
      }

      // ── c:other — user wants to type a custom category ───────────────────
      if (data === "c:other") {
        const pendingOther = await getPendingAction(user.id);
        if (!pendingOther || pendingOther.intent !== "clarify_needed") {
          await ctx.answerCallbackQuery({ text: labels.categoryExpiredMsg });
          await ctx.reply(labels.categoryExpiredMsg);
          return;
        }
        await ctx.answerCallbackQuery();
        // Leave pending draft in place so the next text message completes it
        await ctx.reply(labels.typeCategoryPrompt);
        return;
      }

      // ── c:<categoryId> — user tapped an existing category button ─────────
      if (data.startsWith("c:")) {
        const categoryId = data.slice(2);
        const pendingCat = await getPendingAction(user.id);
        if (!pendingCat || pendingCat.intent !== "clarify_needed") {
          await ctx.answerCallbackQuery({ text: labels.categoryExpiredMsg });
          await ctx.reply(labels.categoryExpiredMsg);
          return;
        }

        const draft = pendingCat.draft as Record<string, unknown>;
        const amount = draft.amount as number | undefined;
        const rawType = draft.type as string | undefined;

        if (!amount || amount <= 0 || !rawType) {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }

        // Verify the category belongs to this user
        const catRecord = await prisma.category.findFirst({
          where: { id: categoryId, userId: user.id },
          select: { id: true, name: true },
        });
        if (!catRecord) {
          await ctx.answerCallbackQuery({ text: labels.notFoundMsg });
          await ctx.reply(labels.notFoundMsg);
          return;
        }

        const txType: TxType = rawType === "income" ? TxType.income : TxType.expense;
        const dateStr = (draft.date as string | undefined) ?? "today";
        const note = draft.note as string | undefined;

        await ctx.answerCallbackQuery();
        await finalizeLog(
          { reply: (text, opts) => ctx.reply(text, opts) },
          user,
          prisma,
          { amount, txType, category: catRecord.name, dateStr, note },
          lang
        );
        return;
      }

      // ── dd:given / dd:taken — direction chosen for a direction-unknown debt ─
      if (data === "dd:given" || data === "dd:taken") {
        const pendingDir = await getPendingAction(user.id);
        if (!pendingDir || pendingDir.intent !== "confirm_debt") {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }
        const draft = pendingDir.draft as Record<string, unknown>;
        const debtCounterparty = draft.counterparty as string;
        const debtAmount = draft.amount as number;
        const debtDateStr = (draft.dateStr as string) ?? "today";
        const chosenDirection: "given" | "taken" = data === "dd:given" ? "given" : "taken";

        const createdDirDebt = await createDebt({
          userId: user.id,
          counterparty: debtCounterparty,
          amountUzs: BigInt(debtAmount),
          direction: chosenDirection === "given" ? DebtDirection.given : DebtDirection.taken,
          note: null,
          occurredAt: dateStringToUtc(debtDateStr),
        });
        await clearPendingAction(user.id);

        const cardDir = buildDebtCard(createdDirDebt, lang, "saved", createdDirDebt.occurredAt);
        const dashDir = await dashboardReplyOptions(user.id);
        await ctx.answerCallbackQuery();
        await ctx.reply(cardDir.text + dashDir.extraText, {
          reply_markup: { inline_keyboard: [...dashDir.dashRows, cardDir.editDeleteRow] },
        });
        return;
      }

      // ── de:<id> — open field picker for a saved debt ──────────────────────
      if (data.startsWith("de:")) {
        const debtId = data.slice(3);
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru" ? "Что изменить?" : lang === "en" ? "What to edit?" : "Nimani o'zgartirish?",
          {
            reply_markup: {
              inline_keyboard: [[
                { text: lang === "ru" ? "✏️ Имя" : lang === "en" ? "✏️ Name" : "✏️ Ism", callback_data: `def:n:${debtId}` },
                { text: lang === "ru" ? "💰 Сумма" : lang === "en" ? "💰 Amount" : "💰 Summa", callback_data: `def:a:${debtId}` },
                { text: lang === "ru" ? "↔️ Тип" : lang === "en" ? "↔️ Direction" : "↔️ Yo'nalishi", callback_data: `def:d:${debtId}` },
              ]],
            },
          }
        );
        return;
      }

      // ── def:n:<id> — edit debt name ───────────────────────────────────────
      if (data.startsWith("def:n:")) {
        const debtId = data.slice(6);
        await upsertPendingAction(user.id, {
          intent: "edit_debt",
          draft: { debtId, field: "name" },
          question: "",
        });
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru" ? "Введите новое имя:" : lang === "en" ? "Enter the new name:" : "Yangi ismni yozing:",
          { reply_markup: { force_reply: true } }
        );
        return;
      }

      // ── def:a:<id> — edit debt amount ─────────────────────────────────────
      if (data.startsWith("def:a:")) {
        const debtId = data.slice(6);
        await upsertPendingAction(user.id, {
          intent: "edit_debt",
          draft: { debtId, field: "amount" },
          question: "",
        });
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru" ? "Введите новую сумму:" : lang === "en" ? "Enter the new amount:" : "Yangi summani yozing:",
          { reply_markup: { force_reply: true } }
        );
        return;
      }

      // ── def:d:<id> — edit debt direction ─────────────────────────────────
      if (data.startsWith("def:d:")) {
        const debtId = data.slice(6);
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru" ? "Выберите новое направление:" : lang === "en" ? "Choose new direction:" : "Yo'nalishini tanlang:",
          {
            reply_markup: {
              inline_keyboard: [[
                { text: lang === "ru" ? "↗️ Я дал" : lang === "en" ? "↗️ I lent" : "↗️ Men berdim", callback_data: `ded:g:${debtId}` },
                { text: lang === "ru" ? "↙️ Я взял" : lang === "en" ? "↙️ I borrowed" : "↙️ Men oldim", callback_data: `ded:t:${debtId}` },
              ]],
            },
          }
        );
        return;
      }

      // ── ded:g:<id> / ded:t:<id> — apply direction edit ───────────────────
      if (data.startsWith("ded:g:") || data.startsWith("ded:t:")) {
        const isGiven = data.startsWith("ded:g:");
        const debtId = data.slice(6);
        const newDir = isGiven ? DebtDirection.given : DebtDirection.taken;
        const updatedDirDebt = await updateDebt(debtId, user.id, { direction: newDir });
        if (!updatedDirDebt) {
          await ctx.answerCallbackQuery({ text: labels.notFoundMsg });
          await ctx.reply(labels.notFoundMsg);
          return;
        }
        const cardDed = buildDebtCard(updatedDirDebt, lang, "updated", updatedDirDebt.occurredAt);
        const dashDed = await dashboardReplyOptions(user.id);
        await ctx.answerCallbackQuery();
        await ctx.reply(cardDed.text + dashDed.extraText, {
          reply_markup: { inline_keyboard: [...dashDed.dashRows, cardDed.editDeleteRow] },
        });
        return;
      }

      // ── dx:<id> — ask delete confirmation ─────────────────────────────────
      if (data.startsWith("dx:")) {
        const debtId = data.slice(3);
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru" ? "Удалить этот долг?" : lang === "en" ? "Delete this debt?" : "Bu qarzni o'chirasizmi?",
          {
            reply_markup: {
              inline_keyboard: [[
                { text: lang === "ru" ? "Да, удалить" : lang === "en" ? "Yes, delete" : "Ha, o'chir", callback_data: `dxk:${debtId}` },
                { text: lang === "ru" ? "Нет" : lang === "en" ? "No" : "Yo'q", callback_data: "noop:cancel" },
              ]],
            },
          }
        );
        return;
      }

      // ── dxk:<id> — confirm debt deletion ─────────────────────────────────
      if (data.startsWith("dxk:")) {
        const debtId = data.slice(4);
        const deleted = await deleteDebt(debtId, user.id);
        if (!deleted) {
          await ctx.answerCallbackQuery({ text: labels.notFoundMsg });
          await ctx.reply(labels.notFoundMsg);
          return;
        }
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru" ? "🗑 Долг удалён." : lang === "en" ? "🗑 Debt deleted." : "🗑 Qarz o'chirildi."
        );
        return;
      }

      // ── rp:<id> — repay picker: user chose which debt to repay ──────────────
      if (data.startsWith("rp:")) {
        const debtId = data.slice(3);
        const pendingRp = await getPendingAction(user.id);
        if (!pendingRp || pendingRp.intent !== "repay_pick") {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }
        const rpDraft = pendingRp.draft as Record<string, unknown>;
        const rpAmount = (rpDraft.amount as number | null) ?? null;
        const rpRepayAll = (rpDraft.repayAll as boolean | undefined) === true;
        const rpDateStr = (rpDraft.dateStr as string | undefined) ?? "today";

        // Fetch fresh remaining to guard concurrent edits + ownership
        const debtFresh = await getDebtWithPayments(debtId, user.id);
        if (!debtFresh) {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(
            lang === "ru"
              ? "Долг не найден или уже погашен."
              : lang === "en"
              ? "Debt not found or already settled."
              : "Qarz topilmadi yoki allaqachon yopilgan."
          );
          return;
        }

        await clearPendingAction(user.id);
        await ctx.answerCallbackQuery();
        await applyRepayment(
          { reply: (text, opts) => ctx.reply(text, opts) },
          user,
          lang,
          debtId,
          debtFresh.remaining,
          rpAmount,
          rpRepayAll,
          rpDateStr
        );
        return;
      }

      // ── noop:cancel — dismiss silently ────────────────────────────────────
      if (data === "noop:cancel") {
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru" ? "Отменено." : lang === "en" ? "Cancelled." : "Bekor qilindi."
        );
        return;
      }

      // ── feedback:start — "💬 Fikr / Taklif" button from the /help reply ──
      if (data === "feedback:start") {
        await upsertPendingAction(user.id, { intent: "feedback", draft: {}, question: "" });
        await ctx.answerCallbackQuery();
        const fbPrompt =
          lang === "ru"
            ? "✍️ Напишите ваш отзыв или вопрос — он дойдёт прямо до команды.\n\n(Ru / En / Uz — любой язык)"
            : lang === "en"
            ? "✍️ Write your feedback or question — it goes straight to the team.\n\n(Uz / Ru / En — any language)"
            : "✍️ Fikr yoki muammoyingizni yozing — to'g'ridan-to'g'ri jamoaga yetadi.\n\n(Uz / Ru / En — istalgan tilda)";
        await ctx.reply(fbPrompt, { reply_markup: { force_reply: true } });
        return;
      }

      // ── medit:menu — show numbered list of batch entries ──────────────────
      if (data === "medit:menu") {
        const meditPending = await getPendingAction(user.id);
        if (!meditPending || meditPending.intent !== "multi_edit") {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }
        const meditEntries = (meditPending.draft as Record<string, unknown>).entries as Array<{ id: string; kind: "tx" | "debt"; label: string }>;
        if (!Array.isArray(meditEntries) || meditEntries.length === 0) {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }
        // Build numbered buttons, up to 4 per row
        const numBtns: InlineKeyboardButton[] = meditEntries.map((_, idx) => ({
          text: String(idx + 1),
          callback_data: `medit:pick:${idx}`,
        }));
        const numRows: InlineKeyboardButton[][] = [];
        for (let i = 0; i < numBtns.length; i += 4) {
          numRows.push(numBtns.slice(i, i + 4));
        }
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru" ? "Какую запись изменить/удалить?" : lang === "en" ? "Which entry to edit/delete?" : "Qaysi yozuvni tahrirlash/o'chirish?",
          { reply_markup: { inline_keyboard: numRows } }
        );
        return;
      }

      // ── medit:pick:<index> — show edit/delete for a specific batch entry ──
      if (data.startsWith("medit:pick:")) {
        const meditIdx = parseInt(data.slice(11), 10);
        const meditPending2 = await getPendingAction(user.id);
        if (!meditPending2 || meditPending2.intent !== "multi_edit") {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }
        const meditEntries2 = (meditPending2.draft as Record<string, unknown>).entries as Array<{ id: string; kind: "tx" | "debt"; label: string }>;
        if (!Array.isArray(meditEntries2) || meditIdx < 0 || meditIdx >= meditEntries2.length) {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }
        const meditEntry = meditEntries2[meditIdx];
        await ctx.answerCallbackQuery();

        if (meditEntry.kind === "debt") {
          // Fetch debt with ownership guard
          const meditDebt = await getDebtWithPayments(meditEntry.id, user.id);
          if (!meditDebt) {
            await ctx.reply(labels.notFoundMsg);
            return;
          }
          const meditCard = buildDebtCard(
            { id: meditDebt.id, counterparty: meditDebt.counterparty, amountUzs: meditDebt.amountUzs, direction: meditDebt.direction },
            lang,
            "saved",
            meditDebt.occurredAt
          );
          const meditDash = await dashboardReplyOptions(user.id);
          await ctx.reply(meditCard.text + meditDash.extraText, {
            reply_markup: { inline_keyboard: [...meditDash.dashRows, meditCard.editDeleteRow] },
          });
        } else {
          // tx — reuse showUpdatedTx (same edit/delete keyboard as single-entry flow)
          await showUpdatedTx({ reply: (t, o) => ctx.reply(t, o) }, prisma, user, meditEntry.id, lang);
        }
        return;
      }

      // Unknown callback data — just dismiss the spinner
      await ctx.answerCallbackQuery();
    } catch (err) {
      console.error("callbackQuery error:", err);
      try {
        await ctx.answerCallbackQuery();
      } catch {
        // swallow
      }
    }
  });

  // Photo message handler — receipt scanning via vision
  bot.on("message:photo", async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    // Rate limit (same guard as voice/audio)
    if (isRateLimited(from.id)) {
      const phrlUser = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) }, select: { language: true } });
      const phrlLang = (phrlUser?.language as "uz" | "ru" | "en") ?? "uz";
      await ctx.reply(getBotLabels(phrlLang).rateLimitMsg);
      return;
    }

    try {
      // Pick the largest photo variant (Telegram sends multiple sizes; last = largest)
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

      if (largest.file_size !== undefined && largest.file_size > MAX_PHOTO_BYTES) {
        const phszUser = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) }, select: { language: true } });
        const phszLang = (phszUser?.language as "uz" | "ru" | "en") ?? "uz";
        await ctx.reply(getBotLabels(phszLang).photoTooLargeMsg);
        return;
      }

      await ctx.replyWithChatAction("typing");

      // Resolve user (same upsert pattern as voice handler)
      const photoUser = await prisma.user.upsert({
        where: { telegramId: BigInt(from.id) },
        create: {
          telegramId: BigInt(from.id),
          firstName: from.first_name ?? null,
          username: from.username ?? null,
          language: "uz",
        },
        update: {
          firstName: from.first_name ?? null,
          username: from.username ?? null,
        },
      });
      const lang = (photoUser.language ?? "uz") as "uz" | "ru" | "en";
      const photoLabels = getBotLabels(lang);

      // Persistent daily cap for costly ops (voice/audio/photo)
      const photoToday = getTashkentNow().toISOString().slice(0, 10);
      const photoVerdict = evalCostlyCap(
        { ymd: photoUser.costlyOpsYmd, count: photoUser.costlyOpsCount },
        photoToday
      );
      if (!photoVerdict.allowed) {
        await ctx.reply(photoLabels.costlyLimitMsg);
        return;
      }
      await prisma.user.update({
        where: { id: photoUser.id },
        data: { costlyOpsYmd: photoVerdict.next.ymd, costlyOpsCount: photoVerdict.next.count },
      });

      await ensureDefaultCategories(photoUser.id);

      // Load user's categories for vision context
      const userCategories = await prisma.category.findMany({
        where: { userId: photoUser.id },
        select: { name: true },
      });
      const categoryNames = userCategories.map((c) => c.name);

      // Download the photo and convert to base64
      const fileInfo = await ctx.api.getFile(largest.file_id);
      if (!fileInfo.file_path) {
        await ctx.reply(photoLabels.photoDownloadErrMsg);
        return;
      }

      const photoBuffer = await downloadTelegramFile(fileInfo.file_path);
      const imageBase64 = photoBuffer.toString("base64");

      // Vision extraction — one call per photo
      const result = await extractReceipt(imageBase64, "image/jpeg", {
        categoryNames,
        lang,
      });

      if (result.found && result.amountUzs && result.amountUzs > 0) {
        // Prepend a receipt header then delegate to the shared finalizeLog
        await ctx.reply(photoLabels.receiptHeader);
        await finalizeLog(
          { reply: (text, opts) => ctx.reply(text, opts) },
          photoUser,
          prisma,
          {
            amount: result.amountUzs,
            txType: TxType.expense,
            category: result.category ?? null,
            dateStr: "today",
            note: result.note ?? null,
          },
          lang
        );
      } else {
        await ctx.reply(photoLabels.receiptNoAmountMsg);
      }
    } catch (err) {
      console.error("Photo handling error:", err);
      const pherrUser = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) }, select: { language: true } });
      const pherrLang = (pherrUser?.language as "uz" | "ru" | "en") ?? "uz";
      await ctx.reply(getBotLabels(pherrLang).photoProcessErrMsg);
    }
  });

  // Audio message handler (some Telegram clients send audio instead of voice)
  bot.on("message:audio", async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    // Audio size cap (R4): reject overly large audio before downloading
    const audio = ctx.message.audio;
    if (
      (audio.duration !== undefined && audio.duration > 60) ||
      (audio.file_size !== undefined && audio.file_size > 5 * 1024 * 1024)
    ) {
      const auszUser = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) }, select: { language: true } });
      const auszLang = (auszUser?.language as "uz" | "ru" | "en") ?? "uz";
      await ctx.reply(getBotLabels(auszLang).audioTooLongMsg);
      return;
    }

    // Rate limit check before STT + brain
    if (isRateLimited(from.id)) {
      const aurlUser = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) }, select: { language: true } });
      const aurlLang = (aurlUser?.language as "uz" | "ru" | "en") ?? "uz";
      await ctx.reply(getBotLabels(aurlLang).rateLimitMsg);
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");

      // Resolve user's account language BEFORE transcribing so Whisper receives
      // the correct language hint (prevents Uzbek → Turkish mis-detection).
      const audioUser = await prisma.user.upsert({
        where: { telegramId: BigInt(from.id) },
        create: {
          telegramId: BigInt(from.id),
          firstName: from.first_name ?? null,
          username: from.username ?? null,
          language: "uz",
        },
        update: {
          firstName: from.first_name ?? null,
          username: from.username ?? null,
        },
      });
      const audioLang = (audioUser.language ?? "uz") as "uz" | "ru" | "en";

      // Persistent daily cap for costly ops (voice/audio/photo)
      const audioToday = getTashkentNow().toISOString().slice(0, 10);
      const audioVerdict = evalCostlyCap(
        { ymd: audioUser.costlyOpsYmd, count: audioUser.costlyOpsCount },
        audioToday
      );
      if (!audioVerdict.allowed) {
        await ctx.reply(getBotLabels(audioLang).costlyLimitMsg);
        return;
      }
      await prisma.user.update({
        where: { id: audioUser.id },
        data: { costlyOpsYmd: audioVerdict.next.ymd, costlyOpsCount: audioVerdict.next.count },
      });

      const fileInfo = await ctx.api.getFile(audio.file_id);
      if (!fileInfo.file_path) {
        await ctx.reply(getBotLabels(audioLang).audioDownloadErrMsg);
        return;
      }

      const audioBuffer = await downloadTelegramFile(fileInfo.file_path);
      const stt = getSttProvider();
      const transcript = await stt.transcribe(
        audioBuffer,
        audio.file_name ?? "audio.mp3",
        { language: audioLang }
      );

      // (No raw-transcript echo — the user only sees the parsed confirmation card.)
      await handleMessage(
        {
          from,
          reply: (text, opts) => ctx.reply(text, opts),
          replyWithDocument: (file, opts) => ctx.replyWithDocument(file, opts),
          api: ctx.api,
        },
        transcript,
        prisma
      );
    } catch (err) {
      console.error("Audio handling error:", err);
      const auerrUser = await prisma.user.findUnique({ where: { telegramId: BigInt(from.id) }, select: { language: true } });
      const auerrLang = (auerrUser?.language as "uz" | "ru" | "en") ?? "uz";
      await ctx.reply(getBotLabels(auerrLang).audioTranscribeErrMsg);
    }
  });

  return bot;
}

// Singleton bot instance
let _bot: Bot | null = null;

export function getBot(): Bot {
  if (!_bot) {
    _bot = createBot();
  }
  return _bot;
}

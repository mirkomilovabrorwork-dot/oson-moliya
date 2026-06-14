import { Bot } from "grammy";
import { TxType, DebtDirection } from "@prisma/client";
import { getEnv } from "../env";
import { db } from "../db";
import { runBrain } from "../claude/brain";
import { parseAmountUzs } from "../claude/amount";
import {
  ensureDefaultCategories,
  resolveOrCreateCategory,
} from "../services/categories";
import { ensureDefaultAccount } from "../services/accounts";
import { createTransaction } from "../services/transactions";
import {
  getPendingAction,
  upsertPendingAction,
  clearPendingAction,
} from "../services/pending";
import { dashboardReplyOptions, formatConfirmation, formatBudgetAlert, formatAmount, getBotLabels, type InlineKeyboardButton } from "./reply";
import { checkExpenseBudgetBreach } from "../services/budgets";
import { createDebt } from "../services/debts";
import { getSttProvider } from "../stt";
import { downloadTelegramFile } from "./download";
import { runAggregation } from "../services/analytics";
import type { FinanceQuery } from "../types";
import { extractReceipt } from "../claude/receipt";

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
): Promise<void> {
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
        ? ` (конвертировано из ${origStr})`
        : lang === "en"
        ? ` (converted from ${origStr})`
        : ` (${origStr} dan konvertatsiya qilindi)`;
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
  const keyboardRows: InlineKeyboardButton[][] = [
    ...dashConfirm.dashRows,
    actionRow,
  ];

  await ctx.reply(confirmation + budgetWarning + dashConfirm.extraText, {
    reply_markup: { inline_keyboard: keyboardRows },
  });
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
  const typeLabel =
    tx.type === TxType.income
      ? lang === "ru" ? "доход" : lang === "en" ? "income" : "kirim"
      : lang === "ru" ? "расход" : lang === "en" ? "expense" : "chiqim";
  const catPart = tx.category ? `, ${tx.category.name}` : "";
  const head = lang === "ru" ? "✏️ Изменено" : lang === "en" ? "✏️ Updated" : "✏️ Yangilandi";
  const dash = await dashboardReplyOptions(user.id);
  const rows: InlineKeyboardButton[][] = [
    ...dash.dashRows,
    [
      { text: labels.editBtn, callback_data: `e:${tx.id}` },
      { text: labels.deleteBtn, callback_data: `d:${tx.id}` },
    ],
  ];
  await ctx.reply(`${head}: ${formatAmount(tx.amountUzs)}, ${typeLabel}${catPart}.` + dash.extraText, {
    reply_markup: { inline_keyboard: rows },
  });
}

// ── Shared message-handling logic (text + voice share this path) ─────────────

async function handleMessage(
  ctx: {
    from: { id: number; first_name?: string; username?: string } | undefined;
    reply: (text: string, opts?: Parameters<Bot["api"]["sendMessage"]>[2]) => Promise<unknown>;
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
    await ctx.reply(
      "Kechirasiz, xatolik yuz berdi. Iltimos qaytadan urinib ko'ring."
    );
    return;
  }

  const { intent } = brainResult;

  // Reply ONLY in the user's chosen language (set via the /start language picker).
  // Do NOT auto-switch based on the detected input language.
  const lang = (user.language as "uz" | "ru" | "en") ?? "uz";

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

    // Store draft pending for confirmation
    await upsertPendingAction(user.id, {
      intent: "confirm_debt",
      draft: { counterparty, direction, amount, dateStr },
      question: "",
    });

    // Format draft summary
    const amountStr = formatAmount(BigInt(amount));
    const dirLabel =
      direction === "given"
        ? (lang === "ru" ? "↗️ Вы дали" : lang === "en" ? "↗️ You lent" : "↗️ Siz berdingiz")
        : direction === "taken"
        ? (lang === "ru" ? "↙️ Вы взяли" : lang === "en" ? "↙️ You borrowed" : "↙️ Siz oldingiz")
        : (lang === "ru" ? "❓ Направление неизвестно" : lang === "en" ? "❓ Direction unknown" : "❓ Yo'nalish noma'lum");

    const dateLabel =
      dateStr === "today"
        ? (lang === "ru" ? "сегодня" : lang === "en" ? "today" : "bugun")
        : dateStr === "yesterday"
        ? (lang === "ru" ? "вчера" : lang === "en" ? "yesterday" : "kecha")
        : dateStr;

    const summary =
      (lang === "ru"
        ? `📋 Понял долг:\n👤 ${counterparty}\n💰 ${amountStr}\n${dirLabel}\n📅 ${dateLabel}`
        : lang === "en"
        ? `📋 Got it — debt:\n👤 ${counterparty}\n💰 ${amountStr}\n${dirLabel}\n📅 ${dateLabel}`
        : `📋 Qarz tushundim:\n👤 ${counterparty}\n💰 ${amountStr}\n${dirLabel}\n📅 ${dateLabel}`);

    // Build keyboard based on whether direction is known
    let rows: InlineKeyboardButton[][];
    if (direction !== null) {
      rows = [[
        { text: lang === "ru" ? "✅ Подтвердить" : lang === "en" ? "✅ Confirm" : "✅ Tasdiqlash", callback_data: "dbt:ok" },
        { text: lang === "ru" ? "✏️ Изменить" : lang === "en" ? "✏️ Edit" : "✏️ O'zgartirish", callback_data: "dbt:edit" },
      ]];
    } else {
      rows = [
        [
          { text: lang === "ru" ? "↗️ Я дал" : lang === "en" ? "↗️ I lent" : "↗️ Men berdim", callback_data: "dd:given" },
          { text: lang === "ru" ? "↙️ Я взял" : lang === "en" ? "↙️ I borrowed" : "↙️ Men oldim", callback_data: "dd:taken" },
        ],
        [
          { text: lang === "ru" ? "✏️ Изменить" : lang === "en" ? "✏️ Edit" : "✏️ O'zgartirish", callback_data: "dbt:edit" },
        ],
      ];
    }

    await ctx.reply(summary, { reply_markup: { inline_keyboard: rows } });
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

  // ── finance_query ─────────────────────────────────────────────────────────
  if (intent.intent === "finance_query") {
    if (!intent.query) {
      await ctx.reply(intent.reply_text);
      return;
    }
    try {
      const result = await runAggregation(
        user.id,
        intent.query as FinanceQuery,
        lang
      );
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
    const activePending = await getPendingAction(user.id);
    const lastTxId =
      activePending?.lastTransactionId ??
      ((activePending?.draft as Record<string, unknown>)?.lastTransactionId as string | undefined);

    if (!lastTxId) {
      const noTx =
        lang === "ru"
          ? "Нет недавней транзакции для исправления."
          : lang === "en"
          ? "No recent transaction to correct."
          : "Tuzatish uchun yaqin tranzaksiya yo'q.";
      await ctx.reply(noTx);
      return;
    }

    const patch = intent.patch;
    if (!patch) {
      await ctx.reply(intent.reply_text);
      return;
    }

    try {
      const tx = await prisma.transaction.findFirst({
        where: { id: lastTxId, userId: user.id, deletedAt: null },
      });
      if (!tx) {
        const notFound =
          lang === "ru" ? "Транзакция не найдена." : lang === "en" ? "Transaction not found." : "Tranzaksiya topilmadi.";
        await ctx.reply(notFound);
        return;
      }

      let newCategoryId: string | undefined = undefined;
      if (patch.category) {
        const patchTxType = patch.type
          ? patch.type === "income" ? TxType.income : TxType.expense
          : tx.type;
        newCategoryId = await resolveOrCreateCategory(user.id, patch.category, patchTxType);
      }

      const updated = await prisma.transaction.update({
        where: { id: lastTxId },
        data: {
          ...(patch.amount ? { amountUzs: BigInt(patch.amount) } : {}),
          ...(patch.type ? { type: patch.type === "income" ? TxType.income : TxType.expense } : {}),
          ...(newCategoryId !== undefined ? { categoryId: newCategoryId } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
        },
        include: { category: true },
      });

      const confirmation = formatConfirmation({
        amount: updated.amountUzs,
        type: updated.type,
        categoryName: updated.category?.name ?? null,
        date: "today",
        language: lang,
      });
      const prefix =
        lang === "ru" ? "✏️ Исправлено: " : lang === "en" ? "✏️ Updated: " : "✏️ Tuzatildi: ";
      await ctx.reply(prefix + confirmation.replace(/^✅ /, ""));
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

  // ── unknown ───────────────────────────────────────────────────────────────
  await ctx.reply(
    intent.reply_text ||
      (lang === "ru"
        ? "Не понял. Напишите о доходе или расходе."
        : lang === "en"
        ? "I didn't understand. Write about income or expense."
        : "Tushunmadim. Kirim yoki chiqim haqida yozing.")
  );
}

// ── Bot factory ───────────────────────────────────────────────────────────────

export function createBot(): Bot {
  const env = getEnv();
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const prisma = db as import("@prisma/client").PrismaClient;

  // Global error handler
  bot.catch(async (err) => {
    console.error("Bot error while handling update:", err.error);
    try {
      await err.ctx.reply(
        "Kechirasiz, xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
      );
    } catch {
      // swallow
    }
  });

  // Localized welcome shown after the user picks a language.
  const welcomeText = (l: "uz" | "ru" | "en", name: string): string => {
    if (l === "ru") {
      return `Привет, ${name}! 👋\n\nOson Moliya — бот для учёта финансов вашего бизнеса.\n\n✍️ Напишите или 🎤 наговорите о расходе или доходе — я запишу. Например:\n• "500 тысяч продажа"\n• "150 тысяч логистика расход"\n• "покажи отчёт за этот месяц"`;
    }
    if (l === "en") {
      return `Hi, ${name}! 👋\n\nOson Moliya — a bot to track your business finances.\n\n✍️ Type or 🎤 send a voice message about an expense or income — I'll record it. For example:\n• "500 thousand sales"\n• "150 thousand logistics expense"\n• "show this month's report"`;
    }
    return `Salom, ${name}! 👋\n\nOson Moliya — biznesingiz moliyasini kuzatish uchun bot.\n\n✍️ Yozing yoki 🎤 ovozli xabar yuboring — men qayd qilaman. Masalan:\n• "500 ming sotuv"\n• "150 ming logistika chiqim"\n• "shu oyni hisobot ko'rsat"`;
  };

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
    const name =
      from.first_name ?? (lang === "ru" ? "друг" : lang === "en" ? "friend" : "Do'stim");
    const dashStart = await dashboardReplyOptions(user.id);
    const rows: InlineKeyboardButton[][] = [
      ...dashStart.dashRows,
      [{ text: "🌐 Til / Язык / Language", callback_data: "lang:pick" }],
    ];
    await ctx.reply(welcomeText(lang, name) + dashStart.extraText, {
      reply_markup: { inline_keyboard: rows },
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
      update: {},
    });
    const dash = await dashboardReplyOptions(user.id);
    const lead = dash.reply_markup
      ? "📊 Moliyachi'ni ochish uchun pastdagi tugmani bosing:"
      : "📊 Moliyachi'ni ochish uchun havolani bosing:";
    await ctx.reply(lead + dash.extraText, { reply_markup: dash.reply_markup });
  });

  // Localized /help text
  const helpText = (l: "uz" | "ru" | "en"): string => {
    if (l === "ru") {
      return `📖 Oson Moliya — Помощь\n\nОтправьте мне текст или 🎤 голосовое — я автоматически сохраню ваши расходы и доходы.\n\nКоманды:\n/start — Запустить бота\n/language — Сменить язык\n/dashboard — Открыть панель Moliyachi\n/help — Список команд\n\n💡 Например:\n"На обед ушло 35 тысяч"\n"Зарплата 5 000 000 сум"\n"сколько расходов в этом месяце?"`;
    }
    if (l === "en") {
      return `📖 Oson Moliya — Help\n\nSend me text or a 🎤 voice message — I'll automatically save your expenses and income.\n\nCommands:\n/start — Start the bot\n/language — Change language\n/dashboard — Open the Moliyachi dashboard\n/help — Command list\n\n💡 For example:\n"Spent 35 thousand on lunch"\n"Salary 5,000,000 so'm"\n"how much did I spend this month?"`;
    }
    return `📖 Oson Moliya — Yordam\n\nMenga matn yoki 🎤 ovozli xabar yuboring — xarajat va daromadlaringizni avtomatik saqlayman.\n\nBuyruqlar:\n/start — Botni ishga tushirish\n/language — Tilni o'zgartirish\n/dashboard — Moliyachi panelini ochish\n/help — Buyruqlar ro'yxati\n\n💡 Masalan:\n"Tushlikka 35 ming ketdi"\n"Oylik 5 000 000 so'm"\n"bu oy qancha chiqim?"`;
  };

  // /help — command list + examples
  bot.command("help", async (ctx) => {
    const from = ctx.from;
    if (!from) return;
    const u = await prisma.user.findUnique({
      where: { telegramId: BigInt(from.id) },
      select: { language: true },
    });
    const lang = (u?.language as "uz" | "ru" | "en") ?? "uz";
    await ctx.reply(helpText(lang));
  });

  // /language — re-open the language picker any time
  bot.command("language", async (ctx) => {
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
    // Rate limit check before brain call
    if (isRateLimited(ctx.from.id)) {
      await ctx.reply(
        "⏳ Biroz kuting — so'rovlar juda ko'p. 10 daqiqadan so'ng qaytadan urinib ko'ring."
      );
      return;
    }
    await handleMessage(
      {
        from: ctx.from,
        reply: (text, opts) => ctx.reply(text, opts),
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
      await ctx.reply(
        "🎤 Audio juda uzun. Iltimos, 60 soniyadan qisqaroq ovozli xabar yuboring yoki yozma xabar kiriting."
      );
      return;
    }

    // Rate limit check before STT + brain
    if (isRateLimited(from.id)) {
      await ctx.reply(
        "⏳ Biroz kuting — so'rovlar juda ko'p. 10 daqiqadan so'ng qaytadan urinib ko'ring."
      );
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

      const fileInfo = await ctx.api.getFile(voice.file_id);
      if (!fileInfo.file_path) {
        await ctx.reply("Ovozli faylni yuklab bo'lmadi.");
        return;
      }

      const audioBuffer = await downloadTelegramFile(fileInfo.file_path);
      const stt = getSttProvider();
      // Telegram voice is OGG/Opus. Groq accepts .ogg/.opus but NOT ".oga" → use ".ogg".
      const transcript = await stt.transcribe(audioBuffer, "voice.ogg", { language: voiceLang });

      // Echo transcript so user knows what was heard
      await ctx.reply(`🎤 ${transcript}`);

      // Feed into the same brain path as text
      await handleMessage(
        { from, reply: (text, opts) => ctx.reply(text, opts) },
        transcript,
        prisma
      );
    } catch (err) {
      console.error("Voice handling error:", err);
      await ctx.reply(
        "Ovozni tanib bo'lmadi. Iltimos, yozma xabar yuboring yoki qaytadan urinib ko'ring."
      );
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
        const dashStart = await dashboardReplyOptions(user.id);
        await ctx.reply(welcomeText(chosen, name) + dashStart.extraText, {
          reply_markup: dashStart.reply_markup,
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
          select: { id: true, type: true },
        });
        if (!tx) {
          await ctx.answerCallbackQuery({ text: labels.notFoundMsg });
          await ctx.reply(labels.notFoundMsg);
          return;
        }
        await clearPendingAction(user.id);
        await upsertPendingAction(user.id, { intent: "edit_tx", draft: { txId }, question: "" });

        // One window: type toggle + the user's categories + amount/delete — all one tap.
        const editCats = await prisma.category.findMany({
          where: { userId: user.id, type: tx.type },
          select: { id: true, name: true },
          take: 6,
        });
        const rows: InlineKeyboardButton[][] = [];
        rows.push([
          { text: labels.incomeBtn, callback_data: "et:income" },
          { text: labels.expenseBtn, callback_data: "et:expense" },
        ]);
        const catBtns: InlineKeyboardButton[] = editCats.map((c) => ({ text: c.name, callback_data: `ec:${c.id}` }));
        for (let i = 0; i < catBtns.length; i += 2) rows.push(catBtns.slice(i, i + 2));
        rows.push([
          { text: lang === "ru" ? "💰 Сумма" : lang === "en" ? "💰 Amount" : "💰 Summa", callback_data: "ef:amt" },
          { text: labels.deleteBtn, callback_data: `d:${txId}` },
        ]);
        await ctx.answerCallbackQuery();
        await ctx.reply(
          lang === "ru" ? "Что исправить?" : lang === "en" ? "Fix what?" : "Nimani to'g'irlaymiz?",
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
          lang === "ru" ? "Напишите новую сумму (напр. 50 000):" : lang === "en" ? "Write the new amount (e.g. 50 000):" : "Yangi summani yozing (masalan 50 000):",
          { reply_markup: { force_reply: true, input_field_placeholder: lang === "ru" ? "Сумма" : lang === "en" ? "Amount" : "Summa" } }
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

      // ── dbt:ok — confirm a pending debt ───────────────────────────────────
      if (data === "dbt:ok") {
        const pendingDebt = await getPendingAction(user.id);
        if (!pendingDebt || pendingDebt.intent !== "confirm_debt") {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }
        const draft = pendingDebt.draft as Record<string, unknown>;
        const debtCounterparty = draft.counterparty as string;
        const debtAmount = draft.amount as number;
        const debtDirection = draft.direction as "given" | "taken";
        const debtDateStr = (draft.dateStr as string) ?? "today";

        if (!debtCounterparty || !debtAmount || !debtDirection) {
          await ctx.answerCallbackQuery({ text: labels.expiredMsg });
          await ctx.reply(labels.expiredMsg);
          return;
        }

        await createDebt({
          userId: user.id,
          counterparty: debtCounterparty,
          amountUzs: BigInt(debtAmount),
          direction: debtDirection === "given" ? DebtDirection.given : DebtDirection.taken,
          note: null,
          occurredAt: dateStringToUtc(debtDateStr),
        });
        await clearPendingAction(user.id);

        const amtStr = formatAmount(BigInt(debtAmount));
        const dirPart =
          debtDirection === "given"
            ? (lang === "ru" ? `${debtCounterparty} дали` : lang === "en" ? `lent to ${debtCounterparty}` : `${debtCounterparty}ga berdingiz`)
            : (lang === "ru" ? `у ${debtCounterparty} взяли` : lang === "en" ? `borrowed from ${debtCounterparty}` : `${debtCounterparty}dan oldingiz`);
        const savedMsg =
          lang === "ru"
            ? `✅ Долг сохранён: вы ${dirPart} ${amtStr}.`
            : lang === "en"
            ? `✅ Debt saved: you ${dirPart} ${amtStr}.`
            : `✅ Qarz saqlandi: ${dirPart} ${amtStr}.`;

        const dashDebt = await dashboardReplyOptions(user.id);
        await ctx.answerCallbackQuery();
        await ctx.reply(savedMsg + dashDebt.extraText, {
          reply_markup: dashDebt.reply_markup,
        });
        return;
      }

      // ── dbt:edit — cancel pending debt, ask user to retype ────────────────
      if (data === "dbt:edit") {
        await clearPendingAction(user.id);
        const retypeMsg =
          lang === "ru"
            ? "Напишите заново — например: \"Сарвару 2 млн в долг дал\"."
            : lang === "en"
            ? "Write it again — e.g. \"Lent 2 mln to Sarvar\"."
            : "Qaytadan yozing — masalan: \"Sarvarga 2 mln qarz berdim\".";
        await ctx.answerCallbackQuery();
        await ctx.reply(retypeMsg, {
          reply_markup: {
            force_reply: true,
            input_field_placeholder:
              lang === "ru" ? "Сарвару 2 млн в долг" : lang === "en" ? "Lent 2 mln to Sarvar" : "Sarvarga 2 mln qarz berdim",
          },
        });
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

        await createDebt({
          userId: user.id,
          counterparty: debtCounterparty,
          amountUzs: BigInt(debtAmount),
          direction: chosenDirection === "given" ? DebtDirection.given : DebtDirection.taken,
          note: null,
          occurredAt: dateStringToUtc(debtDateStr),
        });
        await clearPendingAction(user.id);

        const amtStr2 = formatAmount(BigInt(debtAmount));
        const dirPart2 =
          chosenDirection === "given"
            ? (lang === "ru" ? `${debtCounterparty} дали` : lang === "en" ? `lent to ${debtCounterparty}` : `${debtCounterparty}ga berdingiz`)
            : (lang === "ru" ? `у ${debtCounterparty} взяли` : lang === "en" ? `borrowed from ${debtCounterparty}` : `${debtCounterparty}dan oldingiz`);
        const savedMsg2 =
          lang === "ru"
            ? `✅ Долг сохранён: вы ${dirPart2} ${amtStr2}.`
            : lang === "en"
            ? `✅ Debt saved: you ${dirPart2} ${amtStr2}.`
            : `✅ Qarz saqlandi: ${dirPart2} ${amtStr2}.`;

        const dashDir = await dashboardReplyOptions(user.id);
        await ctx.answerCallbackQuery();
        await ctx.reply(savedMsg2 + dashDir.extraText, {
          reply_markup: dashDir.reply_markup,
        });
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
      await ctx.reply(
        "⏳ Biroz kuting — so'rovlar juda ko'p. 10 daqiqadan so'ng qaytadan urinib ko'ring."
      );
      return;
    }

    try {
      // Pick the largest photo variant (Telegram sends multiple sizes; last = largest)
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

      if (largest.file_size !== undefined && largest.file_size > MAX_PHOTO_BYTES) {
        await ctx.reply(
          "🖼 Rasm juda katta (5 MB dan oshiq). Iltimos, kichikroq rasm yuboring."
        );
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
        const errMsg =
          lang === "ru"
            ? "Не удалось загрузить фото. Попробуйте ещё раз."
            : lang === "en"
            ? "Could not download photo. Please try again."
            : "Rasmni yuklab bo'lmadi. Qaytadan urinib ko'ring.";
        await ctx.reply(errMsg);
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
        const receiptPrefix =
          lang === "ru"
            ? "🧾 Прочитал чек:"
            : lang === "en"
            ? "🧾 Read receipt:"
            : "🧾 Chekdan o'qidim:";
        await ctx.reply(receiptPrefix);
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
        const noSumMsg =
          lang === "ru"
            ? "Не смог определить сумму из чека. Напишите вручную или пришлите более чёткое фото."
            : lang === "en"
            ? "Could not read the total from the receipt. Please type it manually or send a clearer photo."
            : "Chekdan summani aniqlay olmadim. Iltimos qo'lda yozing yoki aniqroq rasm yuboring.";
        await ctx.reply(noSumMsg);
      }
    } catch (err) {
      console.error("Photo handling error:", err);
      const errMsg =
        "Rasmni qayta ishlashda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.";
      await ctx.reply(errMsg);
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
      await ctx.reply(
        "🎤 Audio juda uzun. Iltimos, 60 soniyadan qisqaroq audio yuboring yoki yozma xabar kiriting."
      );
      return;
    }

    // Rate limit check before STT + brain
    if (isRateLimited(from.id)) {
      await ctx.reply(
        "⏳ Biroz kuting — so'rovlar juda ko'p. 10 daqiqadan so'ng qaytadan urinib ko'ring."
      );
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

      const fileInfo = await ctx.api.getFile(audio.file_id);
      if (!fileInfo.file_path) {
        await ctx.reply("Audio faylni yuklab bo'lmadi.");
        return;
      }

      const audioBuffer = await downloadTelegramFile(fileInfo.file_path);
      const stt = getSttProvider();
      const transcript = await stt.transcribe(
        audioBuffer,
        audio.file_name ?? "audio.mp3",
        { language: audioLang }
      );

      await ctx.reply(`🎤 ${transcript}`);
      await handleMessage(
        { from, reply: (text, opts) => ctx.reply(text, opts) },
        transcript,
        prisma
      );
    } catch (err) {
      console.error("Audio handling error:", err);
      await ctx.reply("Ovozni tanib bo'lmadi. Yozma xabar yuboring.");
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

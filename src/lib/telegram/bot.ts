import { Bot } from "grammy";
import { TxType } from "@prisma/client";
import { getEnv } from "../env";
import { db } from "../db";
import { runBrain } from "../claude/brain";
import {
  ensureDefaultCategories,
  resolveOrCreateCategory,
} from "../services/categories";
import { createTransaction } from "../services/transactions";
import {
  getPendingAction,
  upsertPendingAction,
  clearPendingAction,
} from "../services/pending";
import { dashboardReplyOptions, formatConfirmation } from "./reply";
import { getSttProvider } from "../stt";
import { downloadTelegramFile } from "./download";
import { runAggregation } from "../services/analytics";
import type { FinanceQuery } from "../types";

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

  // Update user language preference
  if (intent.language && intent.language !== user.language) {
    await prisma.user.update({
      where: { id: user.id },
      data: { language: intent.language },
    });
  }

  const lang = intent.language ?? (user.language as "uz" | "ru" | "en") ?? "uz";

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
      await ctx.reply(question);
      return;
    }

    // We have enough to log — resolve category
    let categoryId: string | null = null;
    if (category) {
      try {
        categoryId = await resolveOrCreateCategory(user.id, category, txType);
      } catch {
        // ignore
      }
    }

    const dateStr = intent.date ?? "today";
    const occurredAt = dateStringToUtc(dateStr);

    const tx = await createTransaction({
      userId: user.id,
      categoryId,
      type: txType,
      amountUzs: BigInt(amount),
      note: intent.note ?? null,
      occurredAt,
      source: "bot",
    });

    // Store lastTransactionId so "fix last" and "delete last" work
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

    const confirmation = formatConfirmation({
      amount: tx.amountUzs,
      type: txType,
      categoryName: catRecord?.name ?? category ?? null,
      date: dateStr,
      language: lang,
    });

    const dashConfirm = await dashboardReplyOptions(user.id);
    await ctx.reply(confirmation + dashConfirm.extraText, {
      reply_markup: dashConfirm.reply_markup,
    });
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
    await ctx.reply(intent.reply_text);
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

  // /start handler
  bot.command("start", async (ctx) => {
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

    const name = from.first_name ?? "Do'stim";
    const dashStart = await dashboardReplyOptions(user.id);
    await ctx.reply(
      `Salom, ${name}! 👋\n\nOson Moliya — biznesingiz moliyasini kuzatish uchun bot.\n\nXarajat yoki daromad haqida yozing, men qayd qilaman. Masalan:\n• "500 ming sotuv"\n• "150 ming logistika chiqim"\n• "shu oyni hisobot ko'rsat"` + dashStart.extraText,
      { reply_markup: dashStart.reply_markup }
    );
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

  // Text message handler
  bot.on("message:text", async (ctx) => {
    if (!ctx.from) return;
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

    try {
      // Show typing indicator while transcribing
      await ctx.replyWithChatAction("typing");

      const fileInfo = await ctx.api.getFile(ctx.message.voice.file_id);
      if (!fileInfo.file_path) {
        await ctx.reply("Ovozli faylni yuklab bo'lmadi.");
        return;
      }

      const audioBuffer = await downloadTelegramFile(fileInfo.file_path);
      const stt = getSttProvider();
      const transcript = await stt.transcribe(audioBuffer, "voice.oga");

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

  // Audio message handler (some Telegram clients send audio instead of voice)
  bot.on("message:audio", async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    try {
      await ctx.replyWithChatAction("typing");

      const fileInfo = await ctx.api.getFile(ctx.message.audio.file_id);
      if (!fileInfo.file_path) {
        await ctx.reply("Audio faylni yuklab bo'lmadi.");
        return;
      }

      const audioBuffer = await downloadTelegramFile(fileInfo.file_path);
      const stt = getSttProvider();
      const transcript = await stt.transcribe(
        audioBuffer,
        ctx.message.audio.file_name ?? "audio.mp3"
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

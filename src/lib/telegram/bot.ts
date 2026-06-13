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
import { buildDashboardButton, formatConfirmation } from "./reply";

function getTashkentDateString(): string {
  const now = new Date();
  const tashkent = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return tashkent.toISOString().slice(0, 10);
}

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

export function createBot(): Bot {
  const env = getEnv();
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const prisma = db as import("@prisma/client").PrismaClient;

  // /start handler
  bot.command("start", async (ctx) => {
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

    const name = from.first_name ?? "Do'stim";
    await ctx.reply(
      `Salom, ${name}! 👋\n\nPulTrack — biznesingiz moliyasini kuzatish uchun bot.\n\nXarajat yoki daromad haqida yozing, men qayd qilaman. Masalan:\n"500 ming sotuv" yoki "150 ming logistika chiqim"`,
      {
        reply_markup: await buildDashboardButton(user.id),
      }
    );
  });

  // Text message handler
  bot.on("message:text", async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const text = ctx.message.text;

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
      await ctx.reply("Kechirasiz, xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
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

    const lang = intent.language ?? user.language ?? "uz";

    if (intent.intent === "log_income" || intent.intent === "log_expense") {
      const txType =
        intent.intent === "log_income" ? TxType.income : TxType.expense;

      // Check if we have all required fields
      const amount = pending
        ? // merge with draft
          intent.amount ??
          ((pending.draft as Record<string, unknown>).amount as number | undefined)
        : intent.amount;
      const category = pending
        ? intent.category ??
          ((pending.draft as Record<string, unknown>).category as string | undefined)
        : intent.category;

      if (!amount || amount <= 0) {
        // Need to ask for amount
        const draft = {
          intent: intent.intent,
          type: txType,
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

      // We have enough to log. Resolve category.
      let categoryId: string | null = null;
      if (category) {
        try {
          categoryId = await resolveOrCreateCategory(user.id, category, txType);
        } catch {
          // Ignore category resolution failure
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

      await clearPendingAction(user.id);

      // Fetch category name for confirmation
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

      const dashboardBtn = await buildDashboardButton(user.id);
      await ctx.reply(confirmation, { reply_markup: dashboardBtn });
      return;
    }

    if (intent.intent === "clarify_needed") {
      // Save pending action with current draft
      const draft = {
        intent: "log_income",
        amount: intent.amount ?? null,
        type: intent.type ?? null,
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

    // Phase 2+ intents — "coming soon"
    if (
      intent.intent === "finance_query" ||
      intent.intent === "correct_transaction" ||
      intent.intent === "delete_transaction" ||
      intent.intent === "add_category"
    ) {
      const comingSoon =
        lang === "ru"
          ? "Эта функция скоро появится! 🚀"
          : lang === "en"
          ? "This feature is coming soon! 🚀"
          : "Bu funksiya tez orada qo'shiladi! 🚀";
      await ctx.reply(comingSoon);
      return;
    }

    // Unknown
    await ctx.reply(intent.reply_text || (
      lang === "ru"
        ? "Не понял. Напишите о доходе или расходе."
        : lang === "en"
        ? "I didn't understand. Write about income or expense."
        : "Tushunmadim. Kirim yoki chiqim haqida yozing."
    ));
  });

  // Voice messages — Phase 2
  bot.on("message:voice", async (ctx) => {
    const lang = "uz";
    await ctx.reply(
      lang === "uz"
        ? "Ovozli xabar qo'llab-quvvatlash tez orada qo'shiladi! 🎤"
        : "Voice support coming soon! 🎤"
    );
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

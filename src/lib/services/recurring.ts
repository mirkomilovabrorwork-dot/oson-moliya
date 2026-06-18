import { TxType, RecurringFrequency } from "@prisma/client";
import { db } from "../db";
import { getTashkentNow } from "../dates";

const prisma = db as import("@prisma/client").PrismaClient;

export interface CreateRuleInput {
  userId: string;
  type: TxType;
  categoryId?: string | null;
  amountUzs: bigint;
  originalCurrency?: string | null;
  originalAmount?: bigint | null;
  note?: string | null;
  frequency: RecurringFrequency;
  dayOfMonth: number;
  monthOfYear?: number | null;
  startDate: Date;
  endDate?: Date | null;
}

export interface UpdateRuleInput {
  type?: TxType;
  categoryId?: string | null;
  amountUzs?: bigint;
  originalCurrency?: string | null;
  originalAmount?: bigint | null;
  note?: string | null;
  frequency?: RecurringFrequency;
  dayOfMonth?: number;
  monthOfYear?: number | null;
  startDate?: Date;
  endDate?: Date | null;
}

function validateRuleInput(input: CreateRuleInput | UpdateRuleInput) {
  const day = 'dayOfMonth' in input ? input.dayOfMonth : undefined;
  const freq = 'frequency' in input ? input.frequency : undefined;
  if (day !== undefined && (day < 1 || day > 28)) throw new Error("DAY_OUT_OF_RANGE");
  if (freq === RecurringFrequency.yearly && !('monthOfYear' in input && input.monthOfYear)) {
    // For partial updates, monthOfYear might not be provided - only validate for create
    if ('userId' in input) throw new Error("MONTH_REQUIRED_FOR_YEARLY");
  }
  const month = 'monthOfYear' in input ? input.monthOfYear : undefined;
  if (month !== undefined && month !== null && (month < 1 || month > 12)) throw new Error("MONTH_OUT_OF_RANGE");
}

export async function listActiveRules(userId: string) {
  return prisma.recurringRule.findMany({
    where: { userId, deletedAt: null },
    include: { category: true },
    orderBy: { startDate: "asc" },
  });
}

export async function createRule(input: CreateRuleInput) {
  // Fix D: category is required at creation time
  if (!input.categoryId) throw new Error("CATEGORY_REQUIRED");
  // Validate the category is owned by this user and matches the rule type
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, userId: input.userId },
  });
  if (!category) throw new Error("CATEGORY_NOT_FOUND");
  if (category.type !== input.type) throw new Error("CATEGORY_TYPE_MISMATCH");
  validateRuleInput(input);
  return prisma.recurringRule.create({
    data: {
      userId: input.userId,
      type: input.type,
      categoryId: input.categoryId ?? null,
      amountUzs: input.amountUzs,
      originalCurrency: input.originalCurrency ?? null,
      originalAmount: input.originalAmount ?? null,
      note: input.note ?? null,
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth,
      monthOfYear: input.monthOfYear ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
    },
    include: { category: true },
  });
}

export async function updateRule(id: string, userId: string, patch: UpdateRuleInput) {
  const existing = await prisma.recurringRule.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) return null;
  return prisma.recurringRule.update({
    where: { id },
    data: {
      type: patch.type,
      categoryId: patch.categoryId,
      amountUzs: patch.amountUzs,
      originalCurrency: patch.originalCurrency,
      originalAmount: patch.originalAmount,
      note: patch.note,
      frequency: patch.frequency,
      dayOfMonth: patch.dayOfMonth,
      monthOfYear: patch.monthOfYear,
      startDate: patch.startDate,
      endDate: patch.endDate,
    },
    include: { category: true },
  });
}

export async function deleteRule(id: string, userId: string) {
  const existing = await prisma.recurringRule.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) return null;
  await prisma.recurringRule.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}

export async function restoreRule(id: string, userId: string) {
  const existing = await prisma.recurringRule.findFirst({
    where: { id, userId, deletedAt: { not: null } },
  });
  if (!existing) return null;
  return prisma.recurringRule.update({
    where: { id },
    data: { deletedAt: null },
    include: { category: true },
  });
}

export async function pauseRule(id: string, userId: string) {
  const existing = await prisma.recurringRule.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) return null;
  return prisma.recurringRule.update({ where: { id }, data: { pausedAt: new Date() } });
}

export async function resumeRule(id: string, userId: string) {
  const existing = await prisma.recurringRule.findFirst({ where: { id, userId, deletedAt: null } });
  if (!existing) return null;
  return prisma.recurringRule.update({ where: { id }, data: { pausedAt: null } });
}

/**
 * Compute the next occurrence of a rule given its frequency, day, month, and a base date.
 * Returns a UTC Date representing Tashkent midnight of the target calendar day.
 */
function tashkentMidnightUTC(year: number, month: number, day: number): Date {
  // Tashkent midnight = UTC 19:00 the previous day
  return new Date(Date.UTC(year, month - 1, day) - 5 * 60 * 60 * 1000);
}

function nextOccurrenceAfter(
  frequency: RecurringFrequency,
  dayOfMonth: number,
  monthOfYear: number | null,
  afterDate: Date
): Date {
  // afterDate is a UTC Date; get Tashkent calendar date
  // We want the NEXT occurrence strictly after afterDate (Tashkent calendar)
  const tashkentAfter = new Date(afterDate.getTime() + 5 * 60 * 60 * 1000);
  const afterYear = tashkentAfter.getUTCFullYear();
  const afterMonth = tashkentAfter.getUTCMonth() + 1;
  const afterDay = tashkentAfter.getUTCDate();

  if (frequency === RecurringFrequency.monthly) {
    // Try same month first
    let year = afterYear;
    let month = afterMonth;
    if (dayOfMonth > afterDay) {
      // This month's occurrence is after afterDate
      return tashkentMidnightUTC(year, month, dayOfMonth);
    }
    // Move to next month
    month++;
    if (month > 12) { month = 1; year++; }
    return tashkentMidnightUTC(year, month, dayOfMonth);
  } else {
    // yearly
    const targetMonth = monthOfYear!;
    let year = afterYear;
    // Try current year
    if (targetMonth > afterMonth || (targetMonth === afterMonth && dayOfMonth > afterDay)) {
      return tashkentMidnightUTC(year, targetMonth, dayOfMonth);
    }
    // Move to next year
    year++;
    return tashkentMidnightUTC(year, targetMonth, dayOfMonth);
  }
}

function firstOccurrenceOnOrAfter(
  frequency: RecurringFrequency,
  dayOfMonth: number,
  monthOfYear: number | null,
  startDate: Date
): Date {
  // Get Tashkent calendar date for startDate
  const tashkentStart = new Date(startDate.getTime() + 5 * 60 * 60 * 1000);
  const startYear = tashkentStart.getUTCFullYear();
  const startMonth = tashkentStart.getUTCMonth() + 1;
  const startDay = tashkentStart.getUTCDate();

  if (frequency === RecurringFrequency.monthly) {
    // First occurrence: same month if day >= startDay, else next month
    if (dayOfMonth >= startDay) {
      return tashkentMidnightUTC(startYear, startMonth, dayOfMonth);
    }
    let month = startMonth + 1;
    let year = startYear;
    if (month > 12) { month = 1; year++; }
    return tashkentMidnightUTC(year, month, dayOfMonth);
  } else {
    // yearly
    const targetMonth = monthOfYear!;
    const year = startYear;
    // Try current year
    if (targetMonth > startMonth || (targetMonth === startMonth && dayOfMonth >= startDay)) {
      return tashkentMidnightUTC(year, targetMonth, dayOfMonth);
    }
    return tashkentMidnightUTC(year + 1, targetMonth, dayOfMonth);
  }
}

export interface GenerateResult {
  rulesProcessed: number;
  transactionsCreated: number;
  errors: Array<{ ruleId: string; message: string }>;
}

export async function generateDueTransactions(asOfDate?: Date): Promise<GenerateResult> {
  const now = asOfDate ?? getTashkentNow();

  // Fetch all active, non-paused rules with categoryId set
  const rules = await prisma.recurringRule.findMany({
    where: {
      deletedAt: null,
      pausedAt: null,
      categoryId: { not: null },
    },
  });

  let rulesProcessed = 0;
  let transactionsCreated = 0;
  const errors: Array<{ ruleId: string; message: string }> = [];

  for (const rule of rules) {
    rulesProcessed++;
    try {
      // Compute first nextDue
      let nextDue: Date;
      if (rule.lastGeneratedAt === null) {
        nextDue = firstOccurrenceOnOrAfter(
          rule.frequency,
          rule.dayOfMonth,
          rule.monthOfYear,
          rule.startDate
        );
      } else {
        nextDue = nextOccurrenceAfter(
          rule.frequency,
          rule.dayOfMonth,
          rule.monthOfYear,
          rule.lastGeneratedAt
        );
      }

      let iterations = 0;
      const MAX_ITERATIONS = 366;

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        // Check endDate
        if (rule.endDate && nextDue > rule.endDate) break;
        // Check asOfDate (use Tashkent calendar comparison)
        // nextDue represents Tashkent midnight of target day (UTC 19:00 prev day)
        // We compare by checking if nextDue day <= now day in Tashkent
        const tashkentNow = new Date(now.getTime() + 5 * 60 * 60 * 1000);
        const tashkentNextDue = new Date(nextDue.getTime() + 5 * 60 * 60 * 1000);
        // Convert to calendar-day numbers for comparison
        const nowDayStart = Date.UTC(tashkentNow.getUTCFullYear(), tashkentNow.getUTCMonth(), tashkentNow.getUTCDate());
        const dueDayStart = Date.UTC(tashkentNextDue.getUTCFullYear(), tashkentNextDue.getUTCMonth(), tashkentNextDue.getUTCDate());
        if (dueDayStart > nowDayStart) break;

        // Create transaction
        await prisma.transaction.create({
          data: {
            userId: rule.userId,
            categoryId: rule.categoryId,
            type: rule.type,
            amountUzs: rule.amountUzs,
            originalCurrency: rule.originalCurrency ?? null,
            originalAmount: rule.originalAmount ?? null,
            note: rule.note ?? null,
            occurredAt: nextDue,
            source: "recurring",
            recurringRuleId: rule.id,
          },
        });
        transactionsCreated++;

        // Update lastGeneratedAt
        await prisma.recurringRule.update({
          where: { id: rule.id },
          data: { lastGeneratedAt: nextDue },
        });

        // Compute next
        nextDue = nextOccurrenceAfter(
          rule.frequency,
          rule.dayOfMonth,
          rule.monthOfYear,
          nextDue
        );
      }
    } catch (err) {
      errors.push({
        ruleId: rule.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { rulesProcessed, transactionsCreated, errors };
}

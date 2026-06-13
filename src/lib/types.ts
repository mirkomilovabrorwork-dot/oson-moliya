// Shared API contract between the backend (API routes / services) and the dashboard UI.
// Both the Phase-2 (backend) and Phase-3 (UI) tracks import these — do not diverge from them.
//
// MONEY: BigInt so'm is serialized to a decimal STRING in every API response (BigInt is not
// JSON-serializable). The UI uses Number(str) for charts/arithmetic — safe: realistic so'm
// values (even billions) stay well under Number.MAX_SAFE_INTEGER (~9.0e15).

export type TxType = "income" | "expense";
export type Lang = "uz" | "ru" | "en";

export interface TransactionDTO {
  id: string;
  type: TxType;
  amountUzs: string; // serialized BigInt
  categoryId: string | null;
  categoryName: string | null;
  note: string | null;
  occurredAt: string; // ISO 8601 (UTC)
  source: string; // bot | dashboard | voice | test
}

export interface OverviewDTO {
  income: string; // serialized BigInt — current period
  expense: string;
  net: string;
  prevIncome: string; // previous comparable period (for delta)
  prevExpense: string;
  prevNet: string;
  periodFrom: string; // ISO
  periodTo: string; // ISO
}

export interface CategoryDTO {
  id: string;
  name: string;
  type: TxType;
  emoji: string | null;
  isDefault: boolean;
}

export interface BudgetDTO {
  categoryId: string;
  categoryName: string;
  limitUzs: string; // serialized BigInt
  spentUzs: string; // this month's spend in that category
  percent: number; // 0..N (>=100 => over budget)
}

// GET /api/analytics?from&to  → series for the charts
export interface AnalyticsDTO {
  incomeVsExpense: { income: string; expense: string }; // totals for the period
  byCategory: { categoryId: string | null; categoryName: string; type: TxType; amount: string }[];
  trend: { bucket: string; income: string; expense: string; net: string }[]; // bucket = ISO day or YYYY-MM
}

// Finance-query result the bot's brain produces (server-computed, never model SQL)
export interface FinanceQuery {
  metric: "sum" | "count" | "avg" | "net" | "breakdown" | "report";
  type?: TxType | null;
  category?: string | null;
  period: "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "this_year" | "custom";
  dateFrom?: string | null;
  dateTo?: string | null;
  groupBy?: "category" | "day" | "month" | null;
}

// Standard error envelope for API routes
export interface ApiError {
  error: string;
}

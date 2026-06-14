/**
 * Monthly finance Excel report builder using ExcelJS.
 * Produces a styled .xlsx workbook with two sheets:
 *   Sheet 1 "Hisobot" — summary (income / expense / net) + category breakdown
 *   Sheet 2 "Yozuvlar" — individual transactions for the month
 *
 * Numbers match Home / Analytics because we reuse the same Tashkent-aware
 * month boundaries from services/transactions.ts via getOverview().
 */

import ExcelJS from "exceljs";
import { TxType } from "@prisma/client";

// ── Tashkent helpers (mirrors transactions.ts / analytics.ts) ─────────────────

function getTashkentNow(): Date {
  return new Date(Date.now() + 5 * 60 * 60 * 1000);
}

function tashkentMonthBoundaries(year: number, month: number): { start: Date; end: Date } {
  // start = UTC equivalent of 1st of month at Tashkent midnight (UTC - 5h)
  const start = new Date(Date.UTC(year, month - 1, 1) - 5 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month, 1) - 5 * 60 * 60 * 1000);
  return { start, end };
}

// ── Month name helpers ────────────────────────────────────────────────────────

const MONTH_NAMES_UZ = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];
const MONTH_NAMES_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthName(month: number, lang: string): string {
  const idx = month - 1;
  if (lang === "ru") return MONTH_NAMES_RU[idx] ?? String(month);
  if (lang === "en") return MONTH_NAMES_EN[idx] ?? String(month);
  return MONTH_NAMES_UZ[idx] ?? String(month);
}

// ── Number formatting ─────────────────────────────────────────────────────────

/** Converts a BigInt UZS amount to a plain JS number (safe for amounts < 2^53). */
function toNumber(amount: bigint): number {
  return Number(amount);
}

// ── Palette ───────────────────────────────────────────────────────────────────

const PALETTE = {
  headerFill: "2563EB",      // calm blue
  headerFont: "FFFFFF",      // white text on header
  incomeFont: "16A34A",      // green
  expenseFont: "DC2626",     // red
  netFont: "1D4ED8",         // navy blue
  altRowFill: "F1F5F9",      // very light blue-grey alternate row
  titleFont: "1E3A5F",       // dark navy title
  borderColor: "CBD5E1",     // slate-300 borders
};

function borderThin(color: string): Partial<ExcelJS.Border> {
  return { style: "thin", color: { argb: "FF" + color } };
}

const allBorders = {
  top: borderThin(PALETTE.borderColor),
  bottom: borderThin(PALETTE.borderColor),
  left: borderThin(PALETTE.borderColor),
  right: borderThin(PALETTE.borderColor),
};

// ── Main export ───────────────────────────────────────────────────────────────

export interface BuildMonthlyReportOpts {
  lang: string;
  displayName?: string;
}

export async function buildMonthlyReportXlsx(
  prisma: import("@prisma/client").PrismaClient,
  userId: string,
  opts: BuildMonthlyReportOpts
): Promise<Buffer> {
  const { lang, displayName } = opts;
  const now = getTashkentNow();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-based

  const { start: monthStart, end: monthEnd } = tashkentMonthBoundaries(year, month);

  // ── 1. Aggregate totals (same query logic as getOverview) ─────────────────

  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: TxType.income, deletedAt: null, occurredAt: { gte: monthStart, lt: monthEnd } },
      _sum: { amountUzs: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: TxType.expense, deletedAt: null, occurredAt: { gte: monthStart, lt: monthEnd } },
      _sum: { amountUzs: true },
    }),
  ]);

  const income = incomeAgg._sum.amountUzs ?? 0n;
  const expense = expenseAgg._sum.amountUzs ?? 0n;
  const net = income - expense;

  // ── 2. Category breakdown ─────────────────────────────────────────────────

  const grouped = await prisma.transaction.groupBy({
    by: ["categoryId", "type"],
    where: { userId, deletedAt: null, occurredAt: { gte: monthStart, lt: monthEnd } },
    _sum: { amountUzs: true },
    orderBy: { _sum: { amountUzs: "desc" } },
  });

  const catIds = grouped
    .map((g) => g.categoryId)
    .filter((id): id is string => id !== null);

  const catRecords = catIds.length
    ? await prisma.category.findMany({ where: { id: { in: catIds } } })
    : [];
  const catMap = Object.fromEntries(catRecords.map((c) => [c.id, c]));

  // ── 3. Individual transactions ────────────────────────────────────────────

  const txs = await prisma.transaction.findMany({
    where: { userId, deletedAt: null, occurredAt: { gte: monthStart, lt: monthEnd } },
    orderBy: { occurredAt: "desc" },
    include: { category: true },
  });

  // ── 4. Build workbook ─────────────────────────────────────────────────────

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Oson Moliya";
  workbook.lastModifiedBy = "Oson Moliya Bot";
  workbook.created = new Date();
  workbook.modified = new Date();

  const mName = monthName(month, lang);
  const titleText = `Oson Moliya — ${mName} ${year}`;

  // ── Sheet 1: Hisobot ──────────────────────────────────────────────────────

  const sheet1 = workbook.addWorksheet(
    lang === "ru" ? "Отчёт" : lang === "en" ? "Report" : "Hisobot",
    { properties: { tabColor: { argb: "FF" + PALETTE.headerFill } } }
  );

  sheet1.columns = [
    { key: "label", width: 26 },
    { key: "value", width: 22 },
    { key: "extra", width: 16 },
  ];

  // Title row (merged A1:C1)
  const titleRow = sheet1.addRow([titleText, "", ""]);
  sheet1.mergeCells("A1:C1");
  const titleCell = sheet1.getCell("A1");
  titleCell.font = { name: "Calibri", bold: true, size: 14, color: { argb: "FF" + PALETTE.titleFont } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F7FF" } };
  titleRow.height = 28;

  // Optional owner line
  if (displayName) {
    const ownerRow = sheet1.addRow([
      lang === "ru" ? `Владелец: ${displayName}` : lang === "en" ? `Owner: ${displayName}` : `Egasi: ${displayName}`,
      "", ""
    ]);
    sheet1.mergeCells(`A2:C2`);
    ownerRow.getCell(1).font = { name: "Calibri", italic: true, size: 10, color: { argb: "FF64748B" } };
    ownerRow.height = 16;
  }

  sheet1.addRow([]); // spacer

  // Summary header
  const sumHeaderRow = sheet1.addRow([
    lang === "ru" ? "Показатель" : lang === "en" ? "Metric" : "Ko'rsatkich",
    lang === "ru" ? "Сумма (so'm)" : lang === "en" ? "Amount (so'm)" : "Summa (so'm)",
    "",
  ]);
  sumHeaderRow.eachCell((cell, col) => {
    if (col <= 2) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + PALETTE.headerFill } };
      cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF" + PALETTE.headerFont } };
      cell.alignment = { horizontal: "left", vertical: "middle" };
      cell.border = allBorders;
    }
  });
  sumHeaderRow.height = 20;

  const incomeLabel = lang === "ru" ? "Доход (Kirim)" : lang === "en" ? "Income (Kirim)" : "Kirim (Daromad)";
  const expenseLabel = lang === "ru" ? "Расход (Chiqim)" : lang === "en" ? "Expense (Chiqim)" : "Chiqim (Xarajat)";
  const netLabel = lang === "ru" ? "Итог (Доход − Расход)" : lang === "en" ? "Net (Income − Expense)" : "Sof (Kirim − Chiqim)";

  const incomeRow = sheet1.addRow([incomeLabel, toNumber(income as bigint), ""]);
  incomeRow.getCell(1).font = { name: "Calibri", size: 11, color: { argb: "FF" + PALETTE.incomeFont } };
  incomeRow.getCell(2).font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF" + PALETTE.incomeFont } };
  incomeRow.getCell(2).numFmt = '#,##0';
  incomeRow.getCell(2).alignment = { horizontal: "right" };
  incomeRow.eachCell((cell, col) => { if (col <= 2) cell.border = allBorders; });
  incomeRow.height = 18;

  const expenseRow = sheet1.addRow([expenseLabel, toNumber(expense as bigint), ""]);
  expenseRow.getCell(1).font = { name: "Calibri", size: 11, color: { argb: "FF" + PALETTE.expenseFont } };
  expenseRow.getCell(2).font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF" + PALETTE.expenseFont } };
  expenseRow.getCell(2).numFmt = '#,##0';
  expenseRow.getCell(2).alignment = { horizontal: "right" };
  expenseRow.eachCell((cell, col) => { if (col <= 2) cell.border = allBorders; });
  expenseRow.height = 18;

  const netRow = sheet1.addRow([netLabel, toNumber(net as bigint), ""]);
  netRow.getCell(1).font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF" + PALETTE.netFont } };
  netRow.getCell(2).font = { name: "Calibri", bold: true, size: 12, color: { argb: "FF" + PALETTE.netFont } };
  netRow.getCell(2).numFmt = '#,##0';
  netRow.getCell(2).alignment = { horizontal: "right" };
  netRow.eachCell((cell, col) => { if (col <= 2) { cell.border = allBorders; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } }; } });
  netRow.height = 20;

  sheet1.addRow([]); // spacer

  // Category breakdown header
  const catHeaderLabel = lang === "ru" ? "Категория" : lang === "en" ? "Category" : "Kategoriya";
  const catTypeLabel = lang === "ru" ? "Тип" : lang === "en" ? "Type" : "Turi";
  const catAmountLabel = lang === "ru" ? "Сумма" : lang === "en" ? "Amount" : "Summa";
  const catBrkRow = sheet1.addRow([catHeaderLabel, catAmountLabel, catTypeLabel]);
  catBrkRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + PALETTE.headerFill } };
    cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF" + PALETTE.headerFont } };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = allBorders;
  });
  catBrkRow.height = 20;

  let altRow = false;
  for (const g of grouped) {
    const catRecord = g.categoryId ? catMap[g.categoryId] : null;
    const catName = catRecord?.name ?? (lang === "ru" ? "Другое" : lang === "en" ? "Other" : "Boshqa");
    const txTypeLabel =
      g.type === TxType.income
        ? (lang === "ru" ? "Доход" : lang === "en" ? "Income" : "Kirim")
        : (lang === "ru" ? "Расход" : lang === "en" ? "Expense" : "Chiqim");
    const amt = toNumber((g._sum.amountUzs ?? 0n) as bigint);

    const row = sheet1.addRow([catName, amt, txTypeLabel]);
    const isIncome = g.type === TxType.income;
    const fgColor = isIncome ? "FF" + PALETTE.incomeFont : "FF" + PALETTE.expenseFont;

    if (altRow) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + PALETTE.altRowFill } };
      });
    }
    row.getCell(2).font = { name: "Calibri", bold: true, size: 11, color: { argb: fgColor } };
    row.getCell(2).numFmt = '#,##0';
    row.getCell(2).alignment = { horizontal: "right" };
    row.getCell(3).font = { name: "Calibri", size: 10, color: { argb: fgColor } };
    row.eachCell((cell) => { cell.border = allBorders; });
    row.height = 17;
    altRow = !altRow;
  }

  if (grouped.length === 0) {
    const noData = lang === "ru" ? "Нет данных за этот месяц" : lang === "en" ? "No data for this month" : "Bu oy ma'lumot yo'q";
    const emptyRow = sheet1.addRow([noData, "", ""]);
    sheet1.mergeCells(`A${emptyRow.number}:C${emptyRow.number}`);
    emptyRow.getCell(1).font = { name: "Calibri", italic: true, size: 10, color: { argb: "FF94A3B8" } };
    emptyRow.getCell(1).alignment = { horizontal: "center" };
  }

  // ── Sheet 2: Yozuvlar (Transactions) ─────────────────────────────────────

  const sheet2Name = lang === "ru" ? "Записи" : lang === "en" ? "Transactions" : "Yozuvlar";
  const sheet2 = workbook.addWorksheet(sheet2Name, {
    properties: { tabColor: { argb: "FF10B981" } },
  });

  // Decide whether to include the "Asl summa" (original currency) column
  const hasOriginal = txs.some((t) => t.originalCurrency && t.originalCurrency !== "UZS");

  const txCols: Partial<ExcelJS.Column>[] = [
    { header: lang === "ru" ? "Дата" : lang === "en" ? "Date" : "Sana", key: "date", width: 14 },
    { header: lang === "ru" ? "Тип" : lang === "en" ? "Type" : "Turi", key: "type", width: 12 },
    { header: lang === "ru" ? "Категория" : lang === "en" ? "Category" : "Kategoriya", key: "category", width: 20 },
    { header: lang === "ru" ? "Сумма (so'm)" : lang === "en" ? "Amount (so'm)" : "Summa (so'm)", key: "amount", width: 18 },
  ];

  if (hasOriginal) {
    txCols.push({
      header: lang === "ru" ? "Оригинал" : lang === "en" ? "Original" : "Asl summa",
      key: "original",
      width: 16,
    });
  }

  txCols.push({
    header: lang === "ru" ? "Заметка" : lang === "en" ? "Note" : "Izoh",
    key: "note",
    width: 30,
  });

  sheet2.columns = txCols;

  // Style header row (row 1)
  const hdr = sheet2.getRow(1);
  hdr.height = 20;
  hdr.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + PALETTE.headerFill } };
    cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FF" + PALETTE.headerFont } };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = allBorders;
  });

  // Freeze the header row
  sheet2.views = [{ state: "frozen", ySplit: 1 }];

  // Data rows
  let alt2 = false;
  for (const tx of txs) {
    // Format date in Asia/Tashkent: shift UTC→Tashkent then read UTC parts
    const tzDate = new Date(tx.occurredAt.getTime() + 5 * 60 * 60 * 1000);
    const yyyy = tzDate.getUTCFullYear();
    const mm = String(tzDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(tzDate.getUTCDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const txTypeLabel =
      tx.type === TxType.income
        ? (lang === "ru" ? "Доход" : lang === "en" ? "Income" : "Kirim")
        : (lang === "ru" ? "Расход" : lang === "en" ? "Expense" : "Chiqim");
    const catName = tx.category?.name ?? (lang === "ru" ? "Другое" : lang === "en" ? "Other" : "Boshqa");
    const amtNum = toNumber(tx.amountUzs);

    const rowData: (string | number | null)[] = [
      dateStr,
      txTypeLabel,
      catName,
      amtNum,
    ];

    if (hasOriginal) {
      if (tx.originalCurrency && tx.originalCurrency !== "UZS" && tx.originalAmount != null) {
        rowData.push(`${toNumber(tx.originalAmount)} ${tx.originalCurrency}`);
      } else {
        rowData.push(null);
      }
    }

    rowData.push(tx.note ?? null);

    const row = sheet2.addRow(rowData);
    row.height = 16;

    const isIncome = tx.type === TxType.income;
    const fgColor = isIncome ? "FF" + PALETTE.incomeFont : "FF" + PALETTE.expenseFont;

    if (alt2) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + PALETTE.altRowFill } };
      });
    }

    // Amount column (always index 4, 1-based)
    const amtCell = row.getCell(4);
    amtCell.numFmt = '#,##0';
    amtCell.alignment = { horizontal: "right" };
    amtCell.font = { name: "Calibri", size: 10, color: { argb: fgColor } };

    // Date cell left-aligned
    row.getCell(1).alignment = { horizontal: "left" };
    row.eachCell((cell) => { cell.border = allBorders; });
    alt2 = !alt2;
  }

  if (txs.length === 0) {
    const noData2 = lang === "ru" ? "Нет записей за этот месяц" : lang === "en" ? "No records this month" : "Bu oy yozuv yo'q";
    const totalCols = txCols.length;
    const emptyRow = sheet2.addRow([noData2, ...Array(totalCols - 1).fill("")]);
    sheet2.mergeCells(`A2:${String.fromCharCode(64 + totalCols)}2`);
    emptyRow.getCell(1).font = { name: "Calibri", italic: true, size: 10, color: { argb: "FF94A3B8" } };
    emptyRow.getCell(1).alignment = { horizontal: "center" };
  }

  // ── 5. Serialize to Buffer ─────────────────────────────────────────────────

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

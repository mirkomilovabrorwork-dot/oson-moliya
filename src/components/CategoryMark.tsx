type CategoryMarkType = "income" | "expense";

interface CategoryMarkProps {
  name?: string | null;
  type?: CategoryMarkType;
  size?: "sm" | "md";
}

function Icon({ kind }: { kind: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    // ── existing icons ──────────────────────────────────────────────────────
    case "megaphone":
      return (
        <svg {...common}>
          <path d="M4 13v-2l13-5v12L4 13z" />
          <path d="M6 13l1.5 5h3L9 14" />
          <path d="M18 9l2-1M18 15l2 1" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-8 0v2" />
          <circle cx="12" cy="9" r="3" />
          <path d="M19 20v-1.5a3 3 0 0 0-2-2.8" />
          <path d="M5 20v-1.5a3 3 0 0 1 2-2.8" />
        </svg>
      );
    case "food":
      return (
        <svg {...common}>
          <path d="M4 10h16" />
          <path d="M6 10a6 6 0 0 0 12 0" />
          <path d="M8 20h8" />
          <path d="M12 14v6" />
          <path d="M8 4v3M12 4v3M16 4v3" />
        </svg>
      );
    case "truck":
      return (
        <svg {...common}>
          <path d="M3 7h11v9H3z" />
          <path d="M14 10h4l3 3v3h-7z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5L12 4l8 6.5V20H4z" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="M21 8l-9-5-9 5 9 5 9-5z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case "sale":
      return (
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="M17 7.5c-.8-1-2.2-1.5-4-1.5-2.2 0-4 .9-4 2.6 0 1.6 1.5 2.2 3.7 2.6 2.4.5 4.3 1.1 4.3 3 0 1.7-1.8 2.8-4.2 2.8-2 0-3.6-.6-4.8-1.8" />
        </svg>
      );
    case "up":
      return (
        <svg {...common}>
          <path d="M12 19V5" />
          <path d="M6 11l6-6 6 6" />
        </svg>
      );

    // ── new category icons ──────────────────────────────────────────────────
    case "wrench":
      // service / xizmat
      return (
        <svg {...common}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case "briefcase":
      // wage / maosh
      return (
        <svg {...common}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <path d="M12 12v.01" />
        </svg>
      );
    case "plus":
      // other income / boshqa kirim
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "receipt":
      // tax / soliq
      return (
        <svg {...common}>
          <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1z" />
          <path d="M8 10h8M8 14h4" />
        </svg>
      );
    case "bulb":
      // utilities / kommunal
      return (
        <svg {...common}>
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17H8v-2.3A7 7 0 0 1 5 9a7 7 0 0 1 7-7z" />
        </svg>
      );
    case "car":
      // transport / taksi
      return (
        <svg {...common}>
          <path d="M5 11l1.5-4.5h11L19 11" />
          <rect x="2" y="11" width="20" height="7" rx="2" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
          <path d="M2 15h1M21 15h1" />
        </svg>
      );
    case "phone":
      // mobile / mobil aloqa
      return (
        <svg {...common}>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M12 18h.01" />
        </svg>
      );
    case "globe":
      // internet
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20A14.5 14.5 0 0 0 12 2z" />
          <path d="M2 12h20" />
        </svg>
      );
    case "pill":
      // medicine / dori-darmon
      return (
        <svg {...common}>
          <path d="M10.5 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v7" />
          <path d="M8 12h4M10 10v4" />
          <path d="M16 19h6M19 16v6" />
        </svg>
      );
    case "book":
      // education / ta'lim
      return (
        <svg {...common}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <path d="M8 7h8M8 11h5" />
        </svg>
      );
    case "coffee":
      // hospitality / mehmondorchilik — a coffee cup (treating/entertaining)
      return (
        <svg {...common}>
          <path d="M17 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" />
          <path d="M6 2v2M10 2v2M14 2v2" />
        </svg>
      );
    case "shirt":
      // clothing / kiyim
      return (
        <svg {...common}>
          <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z" />
        </svg>
      );
    case "gift":
      // gift / sovg'a
      return (
        <svg {...common}>
          <polyline points="20 12 20 22 4 22 4 12" />
          <rect x="2" y="7" width="20" height="5" />
          <path d="M12 22V7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
      );
    case "umbrella":
      // leisure / dam olish
      return (
        <svg {...common}>
          <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7" />
        </svg>
      );
    case "fuel":
      // fuel / benzin
      return (
        <svg {...common}>
          <path d="M3 22V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15" />
          <path d="M3 11h12" />
          <path d="M17 5l3 3-3 3" />
          <path d="M20 8v5a2 2 0 0 1-2 2h-1" />
        </svg>
      );
    case "sofa":
      // household / uy-ro'zg'or
      return (
        <svg {...common}>
          <path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
          <path d="M2 11a2 2 0 0 1 2-2 2 2 0 0 1 2 2v2h12v-2a2 2 0 0 1 2-2 2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
          <path d="M4 17v2M20 17v2" />
        </svg>
      );
    case "bank":
      // bank fees / bank/komissiya
      return (
        <svg {...common}>
          <path d="M3 21h18" />
          <path d="M3 10h18" />
          <path d="M5 6l7-3 7 3" />
          <path d="M6 10v11M10 10v11M14 10v11M18 10v11" />
        </svg>
      );
    case "minus":
      // other expense / boshqa chiqim
      return (
        <svg {...common}>
          <path d="M5 12h14" />
        </svg>
      );

    // ── account type icons ──────────────────────────────────────────────────
    case "cash":
      // banknote
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      );
    case "card":
      // credit card
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 15h2M10 15h4" />
        </svg>
      );

    // ── neutral fallback ────────────────────────────────────────────────────
    case "tag":
      return (
        <svg {...common}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <circle cx="7" cy="7" r="1.5" />
        </svg>
      );

    default:
      // tag as universal fallback (replaces the old down-arrow default)
      return (
        <svg {...common}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <circle cx="7" cy="7" r="1.5" />
        </svg>
      );
  }
}

function pickKind(name?: string | null, type?: CategoryMarkType): string {
  const n = (name ?? "").toLocaleLowerCase();

  // ── income categories ────────────────────────────────────────────────────
  if (/(marketing|reklama|реклам|promo)/.test(n)) return "megaphone";
  if (/(oylik|maosh|ish haqi|wage|оклад|salary|зарп|xodim|hodim)/.test(n) && type === "income") return "briefcase";
  if (/(sotuv|savdo|sales|продаж)/.test(n)) return "sale";
  if (/(xizmat|услуга|service)/.test(n)) return "wrench";
  if (/(boshqa kirim|прочий доход|other income)/.test(n)) return "plus";

  // ── expense categories ───────────────────────────────────────────────────
  if (/(oziq|ovqat|food|lavash|kafe|restoran|еда|пит|продукт)/.test(n)) return "food";
  if (/(logistika|логистика|logistics|yetkaz|delivery)/.test(n)) return "truck";
  if (/(ijara|arenda|rent|аренд|ofis|office)/.test(n)) return "home";
  if (/(oylik|зарплата|salary|xodim|hodim|команд)/.test(n)) return "team";
  if (/(mahsulot|tovar|product|ombor|товар|склад|goods)/.test(n)) return "box";
  if (/(soliq|налог|tax)/.test(n)) return "receipt";
  if (/(kommunal|коммунал|utilities|bulb)/.test(n)) return "bulb";
  if (/(taksi|такси|taxi)/.test(n)) return "car";
  if (/(^transport$|^транспорт$|^transport$)/.test(n) || n === "transport" || n === "транспорт") return "car";
  if (/(mobil aloqa|мобильн|mobile)/.test(n)) return "phone";
  if (/(internet|интернет)/.test(n)) return "globe";
  if (/(dori|darmon|лекарств|medicine|медикам)/.test(n)) return "pill";
  if (/(ta'lim|talim|образован|education|учёб)/.test(n)) return "book";
  if (/(mehmondorchilik|угощен|hospitality)/.test(n)) return "coffee";
  if (/(kiyim|одежд|clothing|apparel)/.test(n)) return "shirt";
  if (/(sovg['']?a|подарок|gift)/.test(n)) return "gift";
  if (/(dam olish|отдых|leisure|развлеч)/.test(n)) return "umbrella";
  if (/(benzin|бензин|fuel|топлив|gaz)/.test(n)) return "fuel";
  if (/(uy.ro['']?zg['']?or|хозтовар|household)/.test(n)) return "sofa";
  if (/(bank|komissiya|комисси|fee|банк)/.test(n)) return "bank";
  if (/(boshqa chiqim|прочий расход|other expense)/.test(n)) return "minus";

  // ── generic direction fallback ───────────────────────────────────────────
  if (type === "income") return "up";
  return "tag";
}

export function CategoryMark({ name, type = "expense", size = "md" }: CategoryMarkProps) {
  const side = size === "sm" ? 32 : 40;
  const kind = pickKind(name, type);
  const isIncome = type === "income";

  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{
        width: side,
        height: side,
        borderRadius: size === "sm" ? 10 : 13,
        background: isIncome ? "var(--income-wash)" : "var(--surface-sunken)",
        color: isIncome ? "var(--income)" : "var(--fg-muted)",
        border: "1px solid var(--border)",
      }}
      aria-hidden="true"
    >
      <Icon kind={kind} />
    </span>
  );
}

// ── Account icon helper ────────────────────────────────────────────────────

interface AccountIconProps {
  type: string;
  size?: number;
}

/**
 * Inline SVG icon for account types (cash / card / bank / other).
 * No chip — renders the raw SVG at `size`×`size` pixels.
 */
export function AccountIcon({ type, size = 22 }: AccountIconProps) {
  const kind = type === "cash" ? "cash" : type === "card" ? "card" : "bank";
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "cash":
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="2" />
          <path d="M6 12h.01M18 12h.01" />
        </svg>
      );
    case "card":
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 15h2M10 15h4" />
        </svg>
      );
    default:
      // bank / other
      return (
        <svg {...common}>
          <path d="M3 21h18" />
          <path d="M3 10h18" />
          <path d="M5 6l7-3 7 3" />
          <path d="M6 10v11M10 10v11M14 10v11M18 10v11" />
        </svg>
      );
  }
}

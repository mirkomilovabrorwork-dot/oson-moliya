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
    default:
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M18 13l-6 6-6-6" />
        </svg>
      );
  }
}

function pickKind(name?: string | null, type?: CategoryMarkType): string {
  const n = (name ?? "").toLocaleLowerCase();
  if (/(marketing|reklama|реклам|promo)/.test(n)) return "megaphone";
  if (/(oylik|maosh|ish haqi|salary|зарп|xodim|hodim)/.test(n)) return "team";
  if (/(oziq|ovqat|food|lavash|kafe|restoran|еда|пит)/.test(n)) return "food";
  if (/(logistika|transport|yetkaz|delivery|truck|достав|логист)/.test(n)) return "truck";
  if (/(ijara|arenda|rent|ofis|office|аренд)/.test(n)) return "home";
  if (/(mahsulot|tovar|product|ombor|склад|товар)/.test(n)) return "box";
  if (/(sotuv|savdo|sales|продаж|kirim)/.test(n)) return "sale";
  return type === "income" ? "up" : "down";
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

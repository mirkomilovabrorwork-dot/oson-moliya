import {
  TrendingUp,
  Wrench,
  Briefcase,
  Plus,
  Utensils,
  Truck,
  House,
  Users,
  Megaphone,
  Package,
  ReceiptText,
  Lightbulb,
  Car,
  Smartphone,
  Globe,
  Pill,
  GraduationCap,
  Coffee,
  Shirt,
  Gift,
  Palmtree,
  Fuel,
  Sofa,
  Landmark,
  Minus,
  ArrowUp,
  Tag,
  Banknote,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

type CategoryMarkType = "income" | "expense";

interface CategoryMarkProps {
  name?: string | null;
  type?: CategoryMarkType;
  size?: "sm" | "md";
}

const KIND_ICON: Record<string, LucideIcon> = {
  sale: TrendingUp,
  wrench: Wrench,
  briefcase: Briefcase,
  plus: Plus,
  food: Utensils,
  truck: Truck,
  home: House,
  team: Users,
  megaphone: Megaphone,
  box: Package,
  receipt: ReceiptText,
  bulb: Lightbulb,
  car: Car,
  phone: Smartphone,
  globe: Globe,
  pill: Pill,
  book: GraduationCap,
  coffee: Coffee,
  shirt: Shirt,
  gift: Gift,
  umbrella: Palmtree,
  fuel: Fuel,
  sofa: Sofa,
  bank: Landmark,
  minus: Minus,
  up: ArrowUp,
  tag: Tag,
};

function Icon({ kind }: { kind: string }) {
  const LucideComponent = KIND_ICON[kind] ?? Tag;
  return <LucideComponent size={18} strokeWidth={1.8} />;
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
 * Lucide icon for account types (cash / card / bank / other).
 * No chip — renders the raw icon at `size`×`size` pixels.
 */
export function AccountIcon({ type, size = 22 }: AccountIconProps) {
  const LucideComponent =
    type === "cash" ? Banknote : type === "card" ? CreditCard : Landmark;
  return <LucideComponent size={size} strokeWidth={1.8} />;
}

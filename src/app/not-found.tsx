import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--color-bg)" }}
    >
      <div
        className="w-full max-w-sm rounded-[10px] p-8 text-center space-y-4"
        style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <p className="text-4xl font-bold tabular" style={{ color: "var(--color-text-muted)" }}>
          404
        </p>
        <h1 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Sahifa topilmadi
        </h1>
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Bu sahifa mavjud emas yoki ko&apos;chirilgan bo&apos;lishi mumkin.
        </p>
        <Link
          href="/"
          className="inline-block mt-2 w-full py-2.5 rounded-[10px] text-sm font-semibold transition-all text-center"
          style={{ background: "var(--color-brand)", color: "#fff" }}
        >
          Bosh sahifaga qaytish
        </Link>
      </div>
    </div>
  );
}

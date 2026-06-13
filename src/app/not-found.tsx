import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="w-full max-w-sm rounded-md p-8 text-center space-y-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <p className="text-4xl font-semibold tabular" style={{ color: "var(--fg-subtle)" }}>
          404
        </p>
        <h1 className="text-lg font-medium" style={{ color: "var(--fg)" }}>
          Sahifa topilmadi
        </h1>
        <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
          Bu sahifa mavjud emas yoki ko&apos;chirilgan bo&apos;lishi mumkin.
        </p>
        <Link
          href="/"
          className="inline-block mt-2 w-full py-2.5 rounded-lg text-sm font-medium transition-all text-center"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          Bosh sahifaga qaytish
        </Link>
      </div>
    </div>
  );
}

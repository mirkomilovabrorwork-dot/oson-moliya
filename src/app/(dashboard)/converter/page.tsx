import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveLang, t } from "@/lib/i18n";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { getRates } from "@/lib/rates";
import { ConverterClient } from "@/components/ConverterClient";

export const dynamic = "force-dynamic";

export default async function ConverterPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const lang = await resolveLang(user.language);
  const rates = await getRates();

  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <TopNav lang={lang} />
      <BottomNav lang={lang} />
      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-6 pb-28">
        <div className="mb-6">
          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--fg)", fontFamily: "var(--font-serif, serif)" }}
          >
            {t("converter.title", lang)}
          </h1>
        </div>
        <ConverterClient rates={rates} lang={lang} />
      </main>
    </div>
  );
}

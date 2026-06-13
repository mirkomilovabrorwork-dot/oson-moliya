import { cookies } from "next/headers";
import { t, type LangCode } from "@/lib/i18n";

export default async function LoginPage() {
  let lang: LangCode = "uz";
  try {
    const cookieStore = await cookies();
    const c = cookieStore.get("pultrack_lang")?.value;
    if (c === "ru" || c === "en" || c === "uz") lang = c;
  } catch {
    // build-time safety
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">💰</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t("login.title", lang)}
        </h1>
        <p className="text-gray-500 mb-6">{t("login.description", lang)}</p>

        <div className="bg-blue-50 rounded-xl p-5 mb-6">
          <p className="text-sm text-blue-700 font-medium">
            {t("login.instruction", lang)}
          </p>
        </div>

        <a
          href="https://t.me/PulTrackBot"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          {t("login.open_bot", lang)}
        </a>
      </div>
    </div>
  );
}

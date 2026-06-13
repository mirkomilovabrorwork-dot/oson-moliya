import Link from "next/link";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Xush kelibsiz!
        </h1>
        <p className="text-gray-500 mb-6">
          PulTrackga xush kelibsiz! Daromad yoki xarajatlaringizni Telegram bot orqali yozing va ular bu yerda ko&apos;rinadi.
        </p>
        <Link
          href="/"
          className="block w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          Dashboardga o&apos;tish
        </Link>
      </div>
    </div>
  );
}

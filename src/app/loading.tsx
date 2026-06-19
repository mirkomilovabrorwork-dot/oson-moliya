/**
 * Home route loading skeleton.
 * Renders INSTANTLY as the Suspense fallback while page.tsx fetches data.
 * Real TopNav + BottomNav show immediately; only the content area shimmers.
 */
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { Skeleton, SkeletonLine, SkeletonCard } from "@/components/Skeleton";

export default function HomeLoading() {
  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <TopNav lang="uz" />
      <BottomNav lang="uz" />

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-5 sm:py-7 pb-32 space-y-5">

        {/* Hero balance card */}
        <div
          className="p-5 sm:p-6 rounded-[var(--radius-lg)] space-y-3"
          style={{ background: "var(--accent-gradient)", boxShadow: "var(--shadow-lg)" }}
        >
          <SkeletonLine style={{ width: "40%", background: "rgba(255,255,255,.25)", borderRadius: 6 }} />
          <SkeletonLine style={{ width: "65%", height: 38, background: "rgba(255,255,255,.30)", borderRadius: 8 }} />
          <SkeletonLine style={{ width: "30%", background: "rgba(255,255,255,.18)", borderRadius: 6 }} />
        </div>

        {/* Per-currency breakdown card */}
        <div
          className="p-4 sm:p-5 rounded-[var(--radius-lg)] space-y-3"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <SkeletonLine style={{ width: "35%", height: 11 }} />
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Skeleton style={{ width: 32, height: 32, borderRadius: 10 }} />
                <SkeletonLine style={{ width: 36 }} />
              </div>
              <SkeletonLine style={{ width: 80, height: 14 }} />
            </div>
          ))}
        </div>

        {/* This-month KPI card */}
        <div
          className="p-4 sm:p-5 rounded-[var(--radius-lg)] space-y-4"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          <SkeletonLine style={{ width: "30%" }} />
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-xl p-3 space-y-2"
                style={{ background: "var(--surface-sunken)" }}
              >
                <SkeletonLine style={{ width: "70%", height: 10 }} />
                <SkeletonLine style={{ width: "90%", height: 18 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Expense donut + recent transactions — two-col on large screens */}
        <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
          {/* Donut placeholder */}
          <div
            className="p-4 sm:p-5 rounded-[var(--radius-lg)] space-y-3"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
          >
            <SkeletonLine style={{ width: "45%" }} />
            <Skeleton style={{ width: 140, height: 140, borderRadius: "50%", margin: "0 auto" }} />
          </div>

          {/* Recent transactions placeholder */}
          <div
            className="rounded-[var(--radius-lg)] overflow-hidden"
            style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
          >
            <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <SkeletonLine style={{ width: "40%" }} />
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between px-4 py-3.5"
                style={{ borderBottom: i < 5 ? "1px solid var(--border)" : undefined }}
              >
                <div className="flex items-center gap-3">
                  <Skeleton style={{ width: 32, height: 32, borderRadius: 10 }} />
                  <div className="space-y-1.5">
                    <SkeletonLine style={{ width: 90 }} />
                    <SkeletonLine style={{ width: 56, height: 11 }} />
                  </div>
                </div>
                <SkeletonLine style={{ width: 72, height: 14 }} />
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}

/**
 * Generic dashboard route loading skeleton.
 * Covers: /transactions, /debts, /accounts, /analytics, /categories, /more, etc.
 * Real TopNav + BottomNav show immediately; only content shimmers.
 */
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { Skeleton, SkeletonLine } from "@/components/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="min-h-screen" style={{ background: "transparent" }}>
      <TopNav lang="uz" />
      <BottomNav lang="uz" />

      <main className="max-w-2xl mx-auto px-4 sm:px-8 py-5 pb-32 space-y-4">

        {/* Page title line */}
        <SkeletonLine style={{ width: "45%", height: 22 }} />

        {/* List rows */}
        <div
          className="rounded-[var(--radius-lg)] overflow-hidden"
          style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
        >
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between px-4 py-3.5"
              style={{ borderBottom: i < 7 ? "1px solid var(--border)" : undefined }}
            >
              <div className="flex items-center gap-3">
                <Skeleton style={{ width: 36, height: 36, borderRadius: 10 }} />
                <div className="space-y-1.5">
                  <SkeletonLine style={{ width: 110 }} />
                  <SkeletonLine style={{ width: 68, height: 11 }} />
                </div>
              </div>
              <SkeletonLine style={{ width: 80, height: 14 }} />
            </div>
          ))}
        </div>

      </main>
    </div>
  );
}

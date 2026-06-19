/**
 * Skeleton shimmer primitive.
 * Uses CSS vars so it works in both light and dark mode.
 * No external dependencies — inline keyframe only.
 */

const KEYFRAMES = `
@keyframes sk-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: .45; }
}
`;

interface SkeletonProps {
  /** Extra Tailwind / custom class names */
  className?: string;
  style?: React.CSSProperties;
}

/** Single shimmer block — compose to build any shape. */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        className={className}
        style={{
          background: "var(--surface-sunken)",
          borderRadius: "var(--radius-sm)",
          animation: "sk-pulse 1.6s ease-in-out infinite",
          ...style,
        }}
        aria-hidden="true"
      />
    </>
  );
}

/** Thin text-line placeholder (height ~14 px by default). */
export function SkeletonLine({
  className = "",
  style,
}: SkeletonProps) {
  return (
    <Skeleton
      className={className}
      style={{ height: 14, borderRadius: 6, ...style }}
    />
  );
}

/** Taller block for cards / images. */
export function SkeletonCard({
  className = "",
  height = 96,
  style,
}: SkeletonProps & { height?: number }) {
  return (
    <Skeleton
      className={className}
      style={{ height, borderRadius: "var(--radius-lg)", ...style }}
    />
  );
}

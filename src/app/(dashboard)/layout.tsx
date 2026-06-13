// Dashboard group layout — passthrough.
// Shared nav (TopNav) is in src/components/TopNav.tsx and imported per-page.
export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

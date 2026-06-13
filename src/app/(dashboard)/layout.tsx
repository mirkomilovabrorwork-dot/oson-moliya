// Route group layout — minimal passthrough
// Each page in this group renders its own nav for now (Phase 1)
export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

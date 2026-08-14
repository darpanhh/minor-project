import DashboardShell from "@/components/shared/DashboardShell";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}

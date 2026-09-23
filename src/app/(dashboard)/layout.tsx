import { DashboardShell } from "../../components/dashboard/shell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validSession } from "../../server/auth/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  let authenticated = false;
  try { authenticated = validSession((await cookies()).get(SESSION_COOKIE)?.value); } catch { /* Fail closed when auth is not configured. */ }
  if (!authenticated) redirect("/login");
  return <DashboardShell>{children}</DashboardShell>;
}

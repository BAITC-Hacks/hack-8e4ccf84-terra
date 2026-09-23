import { Login } from "../../components/platform/login";
import { safeReturnPath } from "../../lib/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <Login returnTo={safeReturnPath((await searchParams).next)} initialUsername={process.env.ADMIN_USERNAME?.trim() || "admin"} />;
}

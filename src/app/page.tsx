import { redirect } from "next/navigation";

// "/" has no content of its own — it always redirects. Authenticated users
// land on /dashboard; unauthenticated users are then bounced to /sign-in by
// middleware (src/middleware.ts) / the (protected) layout guard.
export default function RootPage() {
  redirect("/dashboard");
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, validSession, validTickSecret } from "./src/server/auth/session";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  try {
    if (path.startsWith("/api/internal/jobs/tick")) {
      if (!validTickSecret(request.headers.get("authorization")))
        return NextResponse.json({ code: "UNAUTHORIZED", message: "Dispatcher authentication required", request_id: crypto.randomUUID() }, { status: 401 });
      return NextResponse.next();
    }
    if (!validSession(request.cookies.get(SESSION_COOKIE)?.value))
      return NextResponse.json({ code: "UNAUTHORIZED", message: "Administrator session required", request_id: crypto.randomUUID() }, { status: 401 });
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (origin && origin !== request.nextUrl.origin)
        return NextResponse.json({ code: "FORBIDDEN", message: "Origin mismatch", request_id: crypto.randomUUID() }, { status: 403 });
    }
    return NextResponse.next();
  } catch {
    return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Authentication is not configured", request_id: crypto.randomUUID() }, { status: 503 });
  }
}

export const config = { matcher: ["/api/v1/:path*", "/api/internal/jobs/tick"] };

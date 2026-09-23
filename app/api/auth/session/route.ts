import { z } from "zod";
import { NextResponse } from "next/server";
import { checkAdminCredentials, createSession, SESSION_COOKIE, validSession } from "@/src/server/auth/session";
import { cookies } from "next/headers";
import { apiError } from "@/src/server/auth/response";

const credentials = z.object({
  username: z.string().trim().min(1).default("admin"),
  password: z.string().min(1),
}).strict();

export async function GET() {
  try {
    const active = validSession((await cookies()).get(SESSION_COOKIE)?.value);
    return NextResponse.json({ authenticated: active, role: active ? "admin" : null }, {
      status: active ? 200 : 401, headers: { "Cache-Control": "private, no-store" },
    });
  } catch { return apiError(503, "SERVICE_UNAVAILABLE", "Authentication is not configured"); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return apiError(403, "FORBIDDEN", "Origin mismatch");
  let body: unknown;
  try { body = await request.json(); } catch { return apiError(400, "INVALID_JSON", "Expected JSON request body"); }
  const parsed = credentials.safeParse(body);
  if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Username and password are required");
  try {
    if (!checkAdminCredentials(parsed.data.username, parsed.data.password)) return apiError(401, "INVALID_CREDENTIALS", "Invalid credentials");
    const response = NextResponse.json({ role: "admin" });
    response.cookies.set(SESSION_COOKIE, createSession(), {
      httpOnly: true, sameSite: "strict", secure: new URL(request.url).protocol === "https:",
      path: "/", maxAge: 8 * 60 * 60,
    });
    return response;
  } catch { return apiError(503, "SERVICE_UNAVAILABLE", "Authentication is not configured"); }
}

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return apiError(403, "FORBIDDEN", "Origin mismatch");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "strict" });
  return response;
}

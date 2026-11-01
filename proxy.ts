import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Optimistic redirect only (cookie present?). The real session check is in PageShell and the API routes.
export function proxy(req: NextRequest) {
  if (!req.cookies.has("__Host-mv_session")) return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/dashboard/:path*", "/vault/:path*", "/categories/:path*", "/settings/:path*", "/audit-log/:path*", "/generator/:path*"] };

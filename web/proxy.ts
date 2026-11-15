import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Page-level redirect only: no session cookie -> /login. This is not security; the Express API
 * authorizes every request (spec §4, §70).
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("ccp_at") || request.cookies.has("ccp_rt");
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";

  if (!hasSession && !isLogin) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the API rewrite, Next internals, static files, the public user guide (/help)
  // and the icons and share images (link previews are fetched signed out).
  matcher: ["/((?!api/|_next/|help|favicon.ico|icon.png|apple-icon.png|opengraph-image|twitter-image|ccp-logo.png).*)"],
};

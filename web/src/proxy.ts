import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/forbidden", "/api/health"];

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  const developmentScriptPolicy = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptPolicy}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`));
  const hasSessionCookie = Boolean(request.cookies.get("anafix-session") || request.cookies.get("__Host-anafix-session"));

  if (!isPublic && !hasSessionCookie) {
    const url = new URL("/login", request.url);
    return applySecurityHeaders(NextResponse.redirect(url), nonce);
  }
  return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
}

export const config = {
  matcher: [
    { source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)", missing: [{ type: "header", key: "next-router-prefetch" }] },
  ],
};

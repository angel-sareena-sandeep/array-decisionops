/**
 * App proxy for security and rate limits.
 */

import { NextRequest, NextResponse } from "next/server";

// Security headers

const SECURITY_HEADERS: Record<string, string> = {
  /** Block clickjacking. */
  "X-Frame-Options": "DENY",
  /** Block MIME sniffing. */
  "X-Content-Type-Options": "nosniff",
  /** Referrer policy. */
  "Referrer-Policy": "strict-origin-when-cross-origin",
  /** Disable unused browser features. */
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  /** Content Security Policy. */
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  /** Strict transport security. */
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  /** Disable DNS prefetch. */
  "X-DNS-Prefetch-Control": "off",
};

// Rate limiting

type RLEntry = { timestamps: number[] };
const rlStore = new Map<string, RLEntry>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60_000;

function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { limited: boolean; retryAfterSec?: number } {
  const now = Date.now();
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    lastCleanup = now;
    const cutoff = now - windowMs;
    for (const [k, e] of rlStore) {
      e.timestamps = e.timestamps.filter((t) => t > cutoff);
      if (e.timestamps.length === 0) rlStore.delete(k);
    }
  }

  const cutoff = now - windowMs;
  let entry = rlStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    rlStore.set(key, entry);
  }
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { limited: true, retryAfterSec: retryAfter };
  }

  entry.timestamps.push(now);
  return { limited: false };
}

// Route rate limits

type RLConfig = { limit: number; windowMs: number };

function getRouteRateLimit(pathname: string, method: string): RLConfig | null {
  // Only for API routes
  if (!pathname.startsWith("/api/")) return null;

  if (pathname.startsWith("/api/import/"))
    return { limit: 10, windowMs: 60_000 };
  if (pathname.startsWith("/api/enrich")) return { limit: 5, windowMs: 60_000 };
  if (pathname.startsWith("/api/chat/clear"))
    return { limit: 5, windowMs: 60_000 };
  if (method === "PATCH") return { limit: 30, windowMs: 60_000 };
  // Default read limit
  return { limit: 60, windowMs: 60_000 };
}

// Body size limits

/** Body size by route. */
function getMaxBodySize(pathname: string): number {
  if (pathname.startsWith("/api/import/")) return 50 * 1024 * 1024; // 50 MB
  return 1024 * 1024; // 1 MB for other API routes
}

// IP helper

function getClientIP(req: NextRequest): string {
  // Common proxy headers
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

// Proxy

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // Rate limiting
  if (pathname.startsWith("/api/")) {
    const rlConfig = getRouteRateLimit(pathname, method);
    if (rlConfig) {
      const ip = getClientIP(req);
      const key = `${ip}:${pathname}`;
      const result = rateLimit(key, rlConfig.limit, rlConfig.windowMs);
      if (result.limited) {
        return new NextResponse(
          JSON.stringify({
            error: "Too many requests. Please try again later.",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(result.retryAfterSec ?? 60),
              ...SECURITY_HEADERS,
            },
          },
        );
      }
    }

    // Body size check
    const contentLength = req.headers.get("content-length");
    if (contentLength) {
      const maxSize = getMaxBodySize(pathname);
      const bodySize = parseInt(contentLength, 10);
      if (!isNaN(bodySize) && bodySize > maxSize) {
        return new NextResponse(
          JSON.stringify({
            error: `Request body too large. Maximum allowed: ${Math.round(maxSize / 1024 / 1024)} MB.`,
          }),
          {
            status: 413,
            headers: {
              "Content-Type": "application/json",
              ...SECURITY_HEADERS,
            },
          },
        );
      }
    }

    // Origin check
    if (
      method === "POST" ||
      method === "PATCH" ||
      method === "DELETE" ||
      method === "PUT"
    ) {
      const origin = req.headers.get("origin");
      const host = req.headers.get("host");

      // Require matching origin and host
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            return new NextResponse(
              JSON.stringify({
                error: "Cross-origin requests are not allowed.",
              }),
              {
                status: 403,
                headers: {
                  "Content-Type": "application/json",
                  ...SECURITY_HEADERS,
                },
              },
            );
          }
        } catch {
          return new NextResponse(
            JSON.stringify({ error: "Invalid origin header." }),
            {
              status: 403,
              headers: {
                "Content-Type": "application/json",
                ...SECURITY_HEADERS,
              },
            },
          );
        }
      }
    }
  }

  // Add security headers
  const response = NextResponse.next();
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
  // Remove x-powered-by
  response.headers.delete("x-powered-by");
  return response;
}

// Skip static/internal paths
export const config = {
  matcher: [
    /* Exclude internal and static files. */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

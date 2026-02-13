import { NextRequest, NextResponse } from "next/server";

const SUPPORTED_LOCALES = new Set([
  "en", "ar", "fr", "id", "ur", "es", "zh", "pt", "ru", "ja", "ko", "it", "bn",
]);

const COOKIE_NAME = "detected-locale";

function parseAcceptLanguage(header: string): string | null {
  const entries = header.split(",").map((part) => {
    const [lang, ...params] = part.trim().split(";");
    const qParam = params.find((p) => p.trim().startsWith("q="));
    const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1.0;
    return { lang: lang.trim().toLowerCase(), q: isNaN(q) ? 0 : q };
  });

  entries.sort((a, b) => b.q - a.q);

  for (const { lang } of entries) {
    // Exact match (e.g. "fr")
    if (SUPPORTED_LOCALES.has(lang)) return lang;
    // Prefix match (e.g. "fr-FR" → "fr")
    const prefix = lang.split("-")[0];
    if (SUPPORTED_LOCALES.has(prefix)) return prefix;
  }

  return null;
}

export function middleware(request: NextRequest) {
  if (request.cookies.has(COOKIE_NAME)) {
    return NextResponse.next();
  }

  const acceptLanguage = request.headers.get("accept-language");
  const detected = acceptLanguage ? parseAcceptLanguage(acceptLanguage) : null;
  const locale = detected ?? "en";

  const response = NextResponse.next();
  response.cookies.set(COOKIE_NAME, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon|icon).*)"],
};

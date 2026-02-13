import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { AppConfigProvider } from "@/lib/config";
import { DesktopNavigation, MobileNavigation } from "@/components/Navigation";
import { Toaster } from "@/components/ui/toaster";
import { generateCsrfToken } from "@/lib/csrf";

// Inline script to apply theme/locale before React hydration to prevent flash
const themeLocaleScript = `
(function() {
  try {
    var theme = localStorage.getItem('theme');
    var isDark = theme === 'dark' ||
      ((!theme || theme === 'system') &&
       window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');

    var locale = localStorage.getItem('locale');
    if (!locale) {
      var m = document.cookie.match(/(?:^|;\s*)detected-locale=([^;]*)/);
      if (m) locale = m[1];
    }
    if (locale) {
      document.documentElement.lang = locale;
      document.documentElement.dir = (locale === 'ar' || locale === 'ur') ? 'rtl' : 'ltr';
    }
  } catch (e) {}
})();
`;

const SITE_URL = process.env.SITE_URL || "https://sabeel.dev";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Sabeel",
  description: "Search across Quran, Hadith, and Islamic texts",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-64.png", type: "image/png", sizes: "64x64" },
    ],
    apple: "/favicon-128.png",
  },
  openGraph: {
    title: "Sabeel",
    description: "Search across Quran, Hadith, and Islamic texts",
    url: SITE_URL,
    siteName: "Sabeel",
    type: "website",
    locale: "en_US",
    images: [{ url: "/icon.png", width: 512, height: 512, alt: "Sabeel" }],
  },
  twitter: {
    card: "summary",
    title: "Sabeel",
    description: "Search across Quran, Hadith, and Islamic texts",
    images: ["/icon.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const csrfToken = generateCsrfToken();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeLocaleScript }} />
        <meta name="csrf-token" content={csrfToken} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa&family=Montserrat:wght@300;400;500;600;700&family=Noto+Naskh+Arabic:wght@400;700&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="shortcut icon" type="image/png" href="/favicon.png" />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <I18nProvider>
            <AppConfigProvider>
              <div className="flex h-screen">
                {/* Desktop Sidebar - hidden on mobile */}
                <DesktopNavigation />

                {/* Main Content */}
                <main className="flex-1 overflow-auto bg-background pb-16 md:pb-0">
                  {children}
                </main>

                {/* Mobile Bottom Navigation - visible only on mobile */}
                <MobileNavigation />
              </div>
              <Toaster />
            </AppConfigProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

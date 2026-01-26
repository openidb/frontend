import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { DesktopNavigation, MobileNavigation } from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Sanad",
  description: "Search across Quran, Hadith, and Islamic texts",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-64.png", type: "image/png", sizes: "64x64" },
    ],
    apple: "/favicon-128.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/png" href="/icon.png" />
        <link rel="shortcut icon" type="image/png" href="/icon.png" />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <I18nProvider>
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
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { DesktopNavigation, MobileNavigation } from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Sanad",
  description: "Search across Quran, Hadith, and Islamic texts",
  icons: {
    icon: "/favicon.svg?v=3",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="antialiased">
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
      </body>
    </html>
  );
}

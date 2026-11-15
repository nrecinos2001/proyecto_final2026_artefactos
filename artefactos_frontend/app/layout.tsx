import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { LiveNotifications } from "@/components/live-notifications";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Monitor de Cisterna",
  description:
    "Monitoreo IoT del nivel y la calidad del agua en la cisterna del hogar",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-border bg-surface">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 text-water"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 2.5c-.3 0-.6.1-.8.4C9.6 5 5 11 5 14.5a7 7 0 0 0 14 0C19 11 14.4 5 12.8 2.9a1 1 0 0 0-.8-.4Z" />
              </svg>
              Monitor de Cisterna
            </Link>
            <div className="ml-auto flex gap-4 text-sm text-muted">
              <Link href="/" className="hover:text-foreground">
                Cisternas
              </Link>
              <Link href="/alertas" className="hover:text-foreground">
                Alertas
              </Link>
            </div>
          </nav>
        </header>
        <LiveNotifications />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}

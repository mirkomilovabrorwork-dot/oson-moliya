import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { TelegramBackButton } from "@/components/TelegramBackButton";
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
  title: "Oson Moliya — Biznes moliyasi",
  description: "Biznesingiz kirim va chiqimlarini kuzating. Telegram orqali yozing — biz qayd qilamiz.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uz"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Telegram Mini App SDK — no-op outside Telegram; must load before hydration */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        {/* No-flash theme: runs before hydration so data-theme is set pre-paint.
            Resolution: localStorage('pultrack_theme') -> system follows OS -> default light. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var s=localStorage.getItem('pultrack_theme');var t;if(s==='light'||s==='dark'){t=s;}else if(s==='system'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}else{t='light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`}
        </Script>
        <TelegramBackButton />
        {children}
      </body>
    </html>
  );
}

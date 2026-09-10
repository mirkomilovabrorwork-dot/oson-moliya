import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
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

// Serif display font for headings (matches the reference Mini-App look)
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Oson Moliya — Biznes moliyasi",
  description: "Biznesingiz kirim va chiqimlarini kuzating. Telegram orqali yozing — biz qayd qilamiz.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Oson Moliya", statusBarStyle: "default" },
};

// Installed-app chrome: the Android status bar takes theme_color, and viewportFit
// "cover" keeps the layout under the gesture bar instead of letterboxing it.
// Zoom is deliberately NOT disabled — capping user scaling breaks accessibility.
export const viewport: Viewport = {
  themeColor: "#15803d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uz"
      className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} h-full antialiased`}
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

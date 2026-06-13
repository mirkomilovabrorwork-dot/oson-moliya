import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
    >
      <body className="min-h-full flex flex-col">
        {/* No-flash theme: runs before hydration so data-theme is set pre-paint.
            Resolution: localStorage('pultrack_theme') → system prefers-color-scheme → light */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var s=localStorage.getItem('pultrack_theme');if(s==='dark'||s==='light'){document.documentElement.dataset.theme=s;}else{var mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');if(mq&&mq.matches){document.documentElement.dataset.theme='dark';}}}catch(e){}})();`}
        </Script>
        {children}
      </body>
    </html>
  );
}

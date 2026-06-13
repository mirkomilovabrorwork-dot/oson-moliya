import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* No-flash theme script: runs synchronously before any paint.
          Resolution order: localStorage('pultrack_theme') → system prefers-color-scheme → light */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('pultrack_theme');if(s==='dark'||s==='light'){document.documentElement.dataset.theme=s;}else{var mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');if(mq&&mq.matches){document.documentElement.dataset.theme='dark';}}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", axes: ["SOFT", "opsz"] });

export const metadata: Metadata = {
  title: { default: "Isabelle Wallet", template: "%s · Isabelle Wallet" },
  description: "A private, personal money manager.",
  robots: { index: false, follow: false, nocache: true },
  applicationName: "Isabelle Wallet",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF9FC" },
    { media: "(prefers-color-scheme: dark)", color: "#151017" },
  ],
};

// Applies "system" theme before paint to avoid a flash.
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )iw_theme=([^;]+)/);var t=m?decodeURIComponent(m[1]):'light';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("iw_theme")?.value;
  const initial = theme === "dark" ? "dark" : "light";
  return (
    <html lang="en" data-theme={initial} className={`${jakarta.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast: "!rounded-2xl !border !border-border !bg-surface !text-ink !shadow-pop !font-sans",
              description: "!text-muted",
              success: "[&_[data-icon]]:!text-success",
              error: "[&_[data-icon]]:!text-danger",
            },
          }}
        />
      </body>
    </html>
  );
}

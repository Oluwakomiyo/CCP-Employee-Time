import type { Metadata, Viewport } from "next";
import { Geist, Inter } from "next/font/google";
import "@/components/arc/foundation.css";
import "./globals.css";
import { Providers } from "./providers";

// Geist for display, Inter for body: mapped onto Arc's font tokens.
const geistDisplay = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const interBody = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Absolute base for share previews (the OG image URL must be absolute). Set NEXT_PUBLIC_SITE_URL for a
// custom domain; on Vercel the production address is used automatically.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

const description =
  "CCP's time and attendance system: clock in on projects at the office or on site, see hours worked per project, review corrections and run payroll.";

// Icons and the share image come from files in app/: favicon.ico, icon.png, apple-icon.png,
// opengraph-image.png and twitter-image.png (all built from the CCP logo).
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "CCP Time", template: "%s · CCP Time" },
  description,
  applicationName: "CCP Time",
  openGraph: {
    type: "website",
    siteName: "CCP Time",
    title: "CCP Time",
    description,
    locale: "en_NG",
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "CCP Time", description },
};

export const viewport: Viewport = {
  // The browser bar on phones in CCP maroon (light) and the app's dark background (dark).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#922d36" },
    { media: "(prefers-color-scheme: dark)", color: "#161415" },
  ],
};

// Applies the saved (or system) theme before first paint so there is no light flash in dark mode.
const themeScript = `try{var t=localStorage.getItem("ccp-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-accent="ccp" data-theme="light" className={`${geistDisplay.variable} ${interBody.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

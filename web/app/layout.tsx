import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "@/components/arc/foundation.css";
import "./globals.css";
import { Providers } from "./providers";

// One family for the whole app: mapped onto both of Arc's font tokens (display and body).
const jakartaDisplay = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist", display: "swap" });
const jakartaBody = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "CCP Time", template: "%s · CCP Time" },
  description: "Employee and project time management for CCP.",
  icons: { icon: "/ccp-logo.png" },
};

// Applies the saved (or system) theme before first paint so there is no light flash in dark mode.
const themeScript = `try{var t=localStorage.getItem("ccp-theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-accent="ccp" data-theme="light" className={`${jakartaDisplay.variable} ${jakartaBody.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

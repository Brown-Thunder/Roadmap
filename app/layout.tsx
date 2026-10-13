import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, Francois_One } from "next/font/google";
import "./brand-tokens.css";
import "./globals.css";

// Stasher brand typefaces: Inter for body/UI, Francois One for headings.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});
const francois = Francois_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-francois",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Weekly Priorities",
  description: "Current and future priorities across pods.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider dynamic proxyUrl={process.env.NEXT_PUBLIC_CLERK_PROXY_URL || undefined}>
      <html lang="en" className={`${inter.variable} ${francois.variable}`}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}

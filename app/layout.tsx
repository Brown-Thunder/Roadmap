import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

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
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}

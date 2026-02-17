import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeMind — Private AI Health Companion",
  description:
    "Your health questions, truly private. AI-powered wellness companion with end-to-end encryption and TEE verification. Built on NEAR Protocol.",
  keywords: [
    "private AI",
    "health",
    "wellness",
    "NEAR Protocol",
    "TEE",
    "end-to-end encryption",
    "privacy",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}

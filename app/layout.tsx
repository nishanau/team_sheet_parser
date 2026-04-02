import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SFL Tools",
  description: "Southern Football League tools — Team Sheet Parser and Best & Fairest voting.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

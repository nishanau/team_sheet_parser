import type { Metadata } from "next";
import Nav from "./components/Nav";
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
      <body>
        <Nav />
        <div style={{ paddingTop: "72px", paddingLeft: "28px", paddingRight: "28px", paddingBottom: "28px" }}>{children}</div>
      </body>
    </html>
  );
}

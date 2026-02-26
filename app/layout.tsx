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
  title: "ARRAY",
  description: "From chat noise to traceable decisions",
  icons: {
    icon: [
      { url: "/cube.png", type: "image/png", sizes: "any" },
    ],
    shortcut: [
      { url: "/cube.png", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Explicit type attribute required for Firefox to recognise the favicon */}
        <link rel="icon" type="image/png" href="/cube.png" />
        <link rel="shortcut icon" type="image/png" href="/cube.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WCL VOD Review",
  description: "Review Warcraft Logs fights alongside a synchronized YouTube video or Twitch VOD.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moonbar WhatsApp Marketing",
  description: "Admin dashboard for Moon Bar and Kitchen WhatsApp campaigns"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

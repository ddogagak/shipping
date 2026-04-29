import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Shipping Admin",
  description: "Supabase-backed shipping admin prototype"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { APP_NAME } from "@/domain/app-meta";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Browser-based spatial-audio prototyping and previsualization.",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

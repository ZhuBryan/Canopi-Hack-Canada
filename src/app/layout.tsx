import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans, Inter } from "next/font/google";
import { AvenueXProvider } from "@/lib/avenuex-store";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-bricolage-grotesque",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Canopi",
  description: "Canopi — find your next home",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${dmSans.variable} ${bricolageGrotesque.variable} ${inter.variable} antialiased`}
      >
        <AvenueXProvider>
          <AuthProvider>{children}</AuthProvider>
        </AvenueXProvider>
      </body>
    </html>
  );
}

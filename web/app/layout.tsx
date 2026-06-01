import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AutoSRE: your autonomous on-call engineer",
  description:
    "AutoSRE detects incidents from Dynatrace, finds the root cause, and proposes a precise fix. It never touches production without your approval.",
  openGraph: {
    title: "AutoSRE: your autonomous on-call engineer",
    description:
      "AutoSRE detects, diagnoses, and proposes the fix. You approve before anything reaches production.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full ${bricolage.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}

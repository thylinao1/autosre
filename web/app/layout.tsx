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
  title: "AutoSRE — AI-Powered Incident Response",
  description:
    "Autonomous on-call engineer that detects incidents from Dynatrace, diagnoses root cause, and proposes a fix — but never touches production without your approval.",
  openGraph: {
    title: "AutoSRE — AI-Powered Incident Response",
    description:
      "Never touches production without your say-so. AutoSRE detects, diagnoses, and proposes — you approve.",
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

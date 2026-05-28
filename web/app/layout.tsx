import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoSRE — Mission Control",
  description: "Autonomous incident-response agent. Diagnoses Dynatrace problems. Never touches prod without your approval.",
  openGraph: {
    title: "AutoSRE Mission Control",
    description: "Autonomous on-call engineer that diagnoses incidents from Dynatrace and fixes them — on your authority.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}

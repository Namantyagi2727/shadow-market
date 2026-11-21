import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shadow Market — Live Product Survival Simulator",
  description:
    "Pitch out loud, Gemini builds the MVP, autonomous browser personas try it and quit, interview quitters live, and a calibrated 200-buyer swarm predicts launch survival.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#07080d] text-zinc-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
        {children}
      </body>
    </html>
  );
}

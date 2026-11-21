import React from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SessionStartClient } from "@/components/session/founder/SessionStartClient";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-founder-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-founder-mono",
  display: "swap",
});

export default function SessionStartPage() {
  return (
    <SessionStartClient
      fontClassName={`${inter.variable} ${jetbrainsMono.variable}`}
    />
  );
}

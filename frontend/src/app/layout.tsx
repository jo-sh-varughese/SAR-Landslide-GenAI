import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SAR-Landslide-GenAI", template: "%s · SAR-Landslide-GenAI" },
  description:
    "All-weather landslide hazard intelligence for the Western Ghats: SAR-conditioned latent diffusion with an explainable, provenance-aware susceptibility model.",
  authors: [
    { name: "Johan S Varughese" },
    { name: "Aiswarya M S" },
    { name: "Nadeema Jahan" },
    { name: "Rishika Pratap Jagdale" },
  ],
};

export const viewport: Viewport = { themeColor: "#05070a", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Terra — прогноз выработки ВЭС", description: "Прогноз, источники данных и журнал агента" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ru"><body>{children}</body></html>;
}

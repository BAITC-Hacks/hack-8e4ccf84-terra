import type { CSSProperties } from "react";
const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  forecast: "M3 3v18h18 M6 15l5-6 4 3 6-8",
  sources: "M4 6c0-4 16-4 16 0s-16 4-16 0 M4 6v12c0 4 16 4 16 0V6 M4 12c0 4 16 4 16 0",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  logout: "M9 3H4v18h5 M9 12h12 M16 7l5 5-5 5",
  moon: "M20 15A9 9 0 019 4a9 9 0 1011 11z",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8 M12 1v3 M12 20v3 M1 12h3 M20 12h3 M4 4l2 2 M18 18l2 2 M4 20l2-2 M18 6l2-2",
  globe: "M3 12h18 M12 3c-6 6-6 12 0 18 M12 3c6 6 6 12 0 18 M12 3a9 9 0 100 18 9 9 0 000-18",
  lock: "M6 10h12v11H6z M8 10V6a4 4 0 018 0v4 M12 14v3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 100 6 3 3 0 000-6",
  close: "M6 6l12 12 M6 18L18 6",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  download: "M12 3v12 M7 10l5 5 5-5 M3 16v5h18v-5",
  wind: "M3 8h12a3 3 0 10-3-3 M3 12h16a3 3 0 11-3 3 M3 16h5a3 3 0 11-3 3",
  check: "M5 12l4 4L19 6",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}

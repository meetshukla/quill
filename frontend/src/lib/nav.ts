import {
  BarChart3,
  CalendarClock,
  LayoutDashboard,
  Megaphone,
  PenLine,
  Repeat2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** match exactly (e.g. /app) vs prefix (e.g. /app/composer) */
  exact?: boolean;
};

// Primary product surfaces. The assistant lives in a persistent right-hand
// panel, so it isn't a nav item.
export const primaryNav: NavItem[] = [
  { label: "Overview", href: "/app", icon: LayoutDashboard, exact: true },
  { label: "Composer", href: "/app/composer", icon: PenLine },
  { label: "Queue", href: "/app/queue", icon: CalendarClock },
  { label: "CTA", href: "/app/cta", icon: Megaphone },
  { label: "Repost", href: "/app/repost", icon: Repeat2 },
  { label: "Analytics", href: "/app/analytics", icon: BarChart3 },
];

// Settings is intentionally NOT a top-level nav item — it lives only in the
// account menu.

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

import { CalendarClock, Zap, type LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** match exactly (e.g. /app) vs prefix (e.g. /app/queue) */
  exact?: boolean;
};

// The three review surfaces. Writing happens in the agent (Claude/Codex);
// this UI is for reviewing what the agent produced and configuring automations.
export const primaryNav: NavItem[] = [
  { label: "Queue", href: "/app/queue", icon: CalendarClock },
  { label: "Automations", href: "/app/automations", icon: Zap },
];

// Settings is intentionally NOT a top-level nav item — it lives only in the
// account menu.

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

import {
  LayoutDashboard, Factory, Box, Activity, History, Plug, Bot, FlaskConical, ClipboardList, Bell, Ticket, FileBarChart, Settings, Presentation, ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth/roles";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  mobile?: boolean;
  group: "betrieb" | "analyse" | "verwaltung";
  minRole?: Role;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true, group: "betrieb" },
  { href: "/anlagen", label: "Anlagen", icon: Factory, mobile: true, group: "betrieb" },
  { href: "/digital-twin", label: "Digital Twin", icon: Box, mobile: true, group: "betrieb" },
  { href: "/live", label: "Live", icon: Activity, group: "betrieb" },
  { href: "/alerts", label: "Meldungen", icon: Bell, mobile: true, group: "betrieb" },
  { href: "/handover", label: "Schichtübergabe", icon: ClipboardList, group: "betrieb" },
  { href: "/tickets", label: "Tickets", icon: Ticket, group: "betrieb" },
  { href: "/historie", label: "Historie", icon: History, group: "analyse" },
  { href: "/ai", label: "KI-Copilot", icon: Bot, group: "analyse" },
  { href: "/simulation", label: "Simulation", icon: FlaskConical, group: "analyse" },
  { href: "/reports", label: "Berichte", icon: FileBarChart, group: "analyse" },
  { href: "/connect", label: "Connect", icon: Plug, mobile: true, group: "verwaltung" },
  { href: "/sales-demo", label: "Sales Demo", icon: Presentation, group: "verwaltung" },
  { href: "/audit", label: "Audit-Log", icon: ShieldCheck, group: "verwaltung", minRole: "admin" },
  { href: "/settings", label: "Einstellungen", icon: Settings, group: "verwaltung" },
];

export const GROUP_LABEL = { betrieb: "Betrieb", analyse: "Analyse", verwaltung: "System" } as const;

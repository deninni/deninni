import {
  LayoutDashboard, Factory, Box, Activity, History, Plug, Bot, FlaskConical, ClipboardList, Bell, Ticket, FileBarChart, Settings, Presentation, ShieldCheck,
  Network, Gauge, TrendingUp, Zap, BadgeEuro, Wrench, Globe2, ScanSearch, CircleCheckBig,
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
  { href: "/executive", label: "Management", icon: Gauge, group: "betrieb" },
  { href: "/brain", label: "Plant Brain", icon: Network, mobile: true, group: "betrieb" },
  { href: "/anlagen", label: "Anlagen", icon: Factory, group: "betrieb" },
  { href: "/digital-twin", label: "Digital Twin", icon: Box, mobile: true, group: "betrieb" },
  { href: "/live", label: "Live", icon: Activity, group: "betrieb" },
  { href: "/alerts", label: "Meldungen", icon: Bell, mobile: true, group: "betrieb" },
  { href: "/maintenance", label: "Wartungsplaner", icon: Wrench, group: "betrieb" },
  { href: "/tickets", label: "Tickets", icon: Ticket, group: "betrieb" },
  { href: "/handover", label: "Schichtübergabe", icon: ClipboardList, group: "betrieb" },
  { href: "/predictive", label: "Predictive", icon: TrendingUp, group: "analyse" },
  { href: "/quality", label: "Quality AI", icon: CircleCheckBig, group: "analyse" },
  { href: "/energy", label: "Energie", icon: Zap, group: "analyse" },
  { href: "/value", label: "Wert & ROI", icon: BadgeEuro, group: "analyse" },
  { href: "/ai", label: "KI-Copilot", icon: Bot, group: "analyse" },
  { href: "/historie", label: "Historie", icon: History, group: "analyse" },
  { href: "/simulation", label: "Simulation", icon: FlaskConical, group: "analyse" },
  { href: "/reports", label: "Berichte", icon: FileBarChart, group: "analyse" },
  { href: "/enterprise", label: "Konzern & Werke", icon: Globe2, group: "verwaltung" },
  { href: "/connect", label: "Connect", icon: Plug, group: "verwaltung" },
  { href: "/discovery", label: "Discovery", icon: ScanSearch, group: "verwaltung", minRole: "maintenance" },
  { href: "/sales-demo", label: "Sales Demo", icon: Presentation, group: "verwaltung" },
  { href: "/audit", label: "Audit-Log", icon: ShieldCheck, group: "verwaltung", minRole: "plant_manager" },
  { href: "/settings", label: "Einstellungen", icon: Settings, group: "verwaltung" },
];

export const GROUP_LABEL = { betrieb: "Betrieb", analyse: "Analyse", verwaltung: "System" } as const;

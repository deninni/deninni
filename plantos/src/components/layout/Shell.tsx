"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Factory, LogOut } from "lucide-react";
import { NAV, GROUP_LABEL } from "./nav";
import { hasRole, ROLE_LABEL, type Role } from "@/lib/auth/roles";
import type { ReactNode } from "react";

export function Shell({ user, children }: { user: { name: string; role: Role; sub: string }; children: ReactNode }) {
  const path = usePathname();
  const items = NAV.filter((n) => !n.minRole || hasRole(user.role, n.minRole));
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-hairline bg-surface lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-accent-border bg-accent-muted text-accent">
            <Factory size={15} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            plant<span className="text-accent">OS</span>
          </span>
        </Link>
        <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Hauptnavigation">
          {(["betrieb", "analyse", "verwaltung"] as const).map((g) => (
            <div key={g} className="mt-3">
              <div className="label-section px-2 pb-1">{GROUP_LABEL[g]}</div>
              {items.filter((i) => i.group === g).map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={`focus-ring flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                    active(i.href) ? "bg-accent-muted text-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"
                  }`}
                  aria-current={active(i.href) ? "page" : undefined}
                >
                  <i.icon size={15} className={active(i.href) ? "text-accent" : ""} />
                  {i.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-hairline px-3 py-3">
          <div className="truncate text-[12px] font-medium">{user.name}</div>
          <div className="truncate text-[11px] text-muted">{ROLE_LABEL[user.role]}</div>
          <form action="/api/auth/logout" method="post" className="mt-2">
            <button className="focus-ring inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-foreground">
              <LogOut size={13} /> Abmelden
            </button>
          </form>
          <div className="mt-2 text-[10px] leading-tight text-stainless-dim">READ ONLY · Kein Produktionszugriff</div>
        </div>
      </aside>

      <main className="safe-bottom min-w-0 flex-1 px-4 pt-4 sm:px-6 sm:pt-6 lg:ml-56">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Mobile Navigation">
        {items.filter((i) => i.mobile).map((i) => (
          <Link key={i.href} href={i.href} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${active(i.href) ? "text-accent" : "text-muted"}`}>
            <i.icon size={18} />
            {i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

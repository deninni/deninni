"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Factory, LogOut, Menu, X } from "lucide-react";
import { NAV, GROUP_LABEL, type NavItem } from "./nav";
import { hasRole, ROLE_LABEL, type Role } from "@/lib/auth/roles";
import { ScopeSwitcher } from "./ScopeSwitcher";
import type { ReactNode } from "react";

function NavList({ items, active, onNavigate }: { items: NavItem[]; active: (h: string) => boolean; onNavigate?: () => void }) {
  return (
    <>
      {(["betrieb", "analyse", "verwaltung"] as const).map((g) => (
        <div key={g} className="mt-3">
          <div className="label-section px-2 pb-1">{GROUP_LABEL[g]}</div>
          {items.filter((i) => i.group === g).map((i) => (
            <Link key={i.href} href={i.href} onClick={onNavigate}
              className={`focus-ring flex min-h-11 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors lg:min-h-8 ${active(i.href) ? "bg-accent-muted text-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"}`}
              aria-current={active(i.href) ? "page" : undefined}>
              <i.icon size={15} className={active(i.href) ? "text-accent" : ""} />
              {i.label}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

export function Shell({ user, tenantName, children }: { user: { name: string; role: Role; sub: string }; tenantName: string; children: ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const items = NAV.filter((n) => !n.minRole || hasRole(user.role, n.minRole));
  const active = (href: string) => path === href || path.startsWith(href + "/");
  useEffect(() => setMore(false), [path]);
  useEffect(() => {
    document.body.style.overflow = more ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [more]);

  const account = (
    <div className="border-t border-hairline px-3 py-3">
      <div className="truncate text-[12px] font-medium">{user.name}</div>
      <div className="truncate text-[11px] text-muted">{ROLE_LABEL[user.role]} · {tenantName}</div>
      <form action="/api/auth/logout" method="post" className="mt-2">
        <button className="focus-ring inline-flex min-h-9 items-center gap-1.5 text-[12px] text-muted hover:text-foreground"><LogOut size={13} /> Abmelden</button>
      </form>
      <div className="mt-1 text-[10px] leading-tight text-stainless-dim">READ ONLY · Kein Produktionszugriff</div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-hairline bg-surface lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-4 pb-2 pt-4">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-accent-border bg-accent-muted text-accent"><Factory size={15} /></span>
          <span className="text-[15px] font-semibold tracking-tight">plant<span className="text-accent">OS</span></span>
        </Link>
        <div className="px-3 pb-1"><ScopeSwitcher /></div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Hauptnavigation"><NavList items={items} active={active} /></nav>
        {account}
      </aside>

      <main className="safe-bottom min-w-0 flex-1 px-4 pt-4 sm:px-6 sm:pt-6 lg:ml-60">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Mobile Navigation">
        {items.filter((i) => i.mobile).map((i) => (
          <Link key={i.href} href={i.href} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${active(i.href) ? "text-accent" : "text-muted"}`}>
            <i.icon size={18} />{i.label}
          </Link>
        ))}
        <button onClick={() => setMore(true)} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] ${more ? "text-accent" : "text-muted"}`} aria-haspopup="dialog" aria-expanded={more}>
          <Menu size={18} />Mehr
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <span className="text-[15px] font-semibold">plant<span className="text-accent">OS</span></span>
            <button onClick={() => setMore(false)} className="focus-ring grid min-h-11 min-w-11 place-items-center rounded-md text-muted" aria-label="Schließen"><X size={20} /></button>
          </div>
          <div className="px-4 pt-3"><ScopeSwitcher /></div>
          <nav className="flex-1 overflow-y-auto px-2 pb-6"><NavList items={items} active={active} onNavigate={() => setMore(false)} /></nav>
          <div className="pb-[env(safe-area-inset-bottom)]">{account}</div>
        </div>
      )}
    </div>
  );
}

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getSession } from "@/lib/auth/server";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { sessionSecretConfigured, sessionHours } from "@/lib/auth/session";
import { dataDir } from "@/lib/store/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const s = (await getSession())!;
  const secret = sessionSecretConfigured();
  const edge = !!process.env.PLANTOS_EDGE_TOKEN;
  const row = (k: string, v: React.ReactNode) => <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]"><span className="text-muted">{k}</span><span>{v}</span></div>;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader eyebrow="System" title="Einstellungen" subtitle="Ehrlicher Systemstatus · alles lokal" />
      <Card title="Konto">
        <div className="divide-y divide-hairline">
          {row("Benutzer", s.sub)}
          {row("Rolle", ROLE_LABEL[s.role])}
          {row("Sitzung gültig bis", new Date(s.exp).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }))}
        </div>
      </Card>
      <Card title="Sicherheit">
        <div className="divide-y divide-hairline">
          {row("Session-Signatur", <Badge tone={secret ? "ok" : "warn"}>{secret ? "HMAC-SHA256 · eigenes Secret" : "HMAC-SHA256 · Dev-Secret – vor Pilot setzen!"}</Badge>)}
          {row("Session-Dauer", `${sessionHours()} h`)}
          {row("Edge-Token", <Badge tone={edge ? "ok" : "muted"}>{edge ? "gesetzt" : "nicht gesetzt (nur Session)"}</Badge>)}
          {row("Login-Schutz", "Rate-Limit 8 Versuche / 5 min")}
          {row("Security-Header", "CSP, X-Frame-Options DENY, nosniff, Permissions-Policy")}
          {row("Audit-Log", "append-only, JSON Lines je Tag")}
          {row("SSO (Entra ID / Google)", <Badge>vorbereitet · nicht konfiguriert</Badge>)}
        </div>
      </Card>
      <Card title="Daten">
        <div className="divide-y divide-hairline">
          {row("Backend", "Datei-Store (local-first)")}
          {row("Datenverzeichnis", <code className="font-mono text-[11px]">{dataDir()}</code>)}
          {row("Messwerte", <Badge tone="warn">Demo-Engine · bis Edge-Agent sendet</Badge>)}
          {row("KI", "lokal, regelbasiert · kein Cloud-LLM")}
          {row("SPS-Zugriff", <Badge tone="ok">nur Lesen</Badge>)}
        </div>
      </Card>
    </div>
  );
}

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getSession } from "@/lib/auth/server";
import { ROLE_LABEL, ROLES, CAPABILITY_MIN_ROLE, can, type Capability } from "@/lib/auth/roles";
import { secretStatus } from "@/lib/config/secrets";
import { oidcConfig } from "@/lib/auth/oidc";
import { tenantConfig } from "@/lib/tenant/config-store";
import { odataConfigFromEnv, SAP_VALIDATION_NOTE } from "@/lib/sap/adapter";
import { sessionSecretConfigured, sessionHours } from "@/lib/auth/session";
import { dataDir } from "@/lib/store/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  const s = (await getSession())!;
  const secret = sessionSecretConfigured();
  const tenant = await tenantConfig(s.tenant);
  const oidc = oidcConfig();
  const sap = odataConfigFromEnv();
  const edge = !!process.env.PLANTOS_EDGE_TOKEN;
  const row = (k: string, v: React.ReactNode) => <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]"><span className="text-muted">{k}</span><span>{v}</span></div>;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader eyebrow="System" title="Einstellungen" subtitle="Ehrlicher Systemstatus · alles lokal" />
      <Card title="Konto">
        <div className="divide-y divide-hairline">
          {row("Benutzer", s.sub)}
          {row("Rolle", ROLE_LABEL[s.role])}
          {row("Mandant", `${tenant.name} (${tenant.id})`)}
          {row("Anmeldung", s.amr === "oidc" ? "SSO (OIDC)" : "Passwort (Demo)")}
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
          {row("SSO (OIDC / Microsoft Entra ID)", <Badge tone={oidc ? "ok" : "muted"}>{oidc ? `konfiguriert · ${oidc.issuer}` : "implementiert · nicht konfiguriert"}</Badge>)}
          {row("SAML", <Badge>Architektur dokumentiert · nicht implementiert</Badge>)}
          {row("Schreib-Rate-Limit", "60 schreibende Aufrufe / min je Benutzer")}
          {row("Sitzungs-Widerruf", "Logout macht Sitzung serverseitig ungültig")}
          {row("Mandantentrennung", "eigener Datenbereich je Mandant, Prüfung in jeder API")}
        </div>
      </Card>
      <Card title="Secrets (nur Status, keine Werte)">
        <div className="divide-y divide-hairline">
          {secretStatus().map((x) => row(`${x.name} – ${x.purpose}`, <Badge tone={x.strong ? "ok" : x.configured ? "warn" : "muted"}>{x.strong ? (x.viaFile ? "gesetzt (Datei)" : "gesetzt") : x.configured ? "zu kurz" : "nicht gesetzt"}</Badge>))}
        </div>
        <p className="mt-2 text-[11px] text-stainless-dim">Secrets auch als Datei möglich (NAME_FILE=/run/secrets/…), z. B. Docker/Kubernetes.</p>
      </Card>
      <Card title="Rollen & Rechte (RBAC)" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[11px]">
            <thead><tr className="text-left text-muted"><th className="px-4 py-2 font-medium">Recht</th>{ROLES.map((r) => <th key={r} className="px-2 py-2 font-medium">{ROLE_LABEL[r].split(" ")[0]}</th>)}</tr></thead>
            <tbody className="divide-y divide-hairline">
              {(Object.keys(CAPABILITY_MIN_ROLE) as Capability[]).map((c) => <tr key={c}><td className="px-4 py-1.5 font-mono">{c}</td>{ROLES.map((r) => <td key={r} className={`px-2 ${r === s.role ? "bg-accent-muted" : ""}`}>{can(r, c) ? "✓" : "–"}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-stainless-dim">Für alle Rollen gilt: SPS nur lesen. Rechte betreffen ausschließlich plantOS-Daten.</p>
      </Card>
      <Card title="Integrationen">
        <div className="divide-y divide-hairline">
          {row("SAP", <Badge tone={sap ? "accent" : "muted"}>{sap ? `OData ${sap.writeEnabled ? "· Schreiben erlaubt" : "· nur Lesen"}` : "Demo-Adapter"}</Badge>)}
          {row("SAP-Hinweis", SAP_VALIDATION_NOTE)}
          {row("Cross-Plant Learning", tenant.crossPlantLearning ? "freigegeben (nur innerhalb des Mandanten)" : "deaktiviert")}
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

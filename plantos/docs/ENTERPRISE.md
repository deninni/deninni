# plantOS · Enterprise-Reifegrad und Roadmap

Zielkunden sind globale Getränke- und CPG-Konzerne. Ihre Einkaufsprozesse prüfen vier Dinge, bevor ein Pilot startet: **OT-Sicherheit, IT-Sicherheit, Wertbeitrag und Skalierbarkeit**.
Dieses Dokument trennt strikt zwischen dem, was **im Code vorhanden** ist, und dem, was **Roadmap** ist.

## 1. Vorhanden (Stand dieses Repos)

| Anforderung | Umsetzung | Nachweis |
|---|---|---|
| Kein Schreibzugriff auf SPS | Schreib-Endpunkte antworten immer 403, Telemetrie-Guard lehnt Schreib-Formen ab | `src/lib/plc/tag-write-guard.ts`, Smoke „Schreibschutz“ |
| Ehrliche Datenherkunft | DEMO / SIMULATED_EDGE / S7_EDGE / EDGE sichtbar auf jeder Seite, SIMULATED nie als S7 | `src/lib/plc/edge-protocol.ts`, Tests |
| Authentifizierung | HMAC-signierte Sessions, Ablauf, Rate-Limit | `src/lib/auth/session.ts`, Tests „session“ |
| Rollen (RBAC) | lesend / Schicht / Admin, serverseitig je Route | `src/lib/auth/roles.ts`, `requireRole()` |
| Audit-Trail | append-only JSONL je Tag: Logins, Tickets, Meldungen, PDF-Exporte, verweigerte Steuerbefehle | `src/lib/audit.ts`, `/audit` |
| Web-Security | CSP ohne externe Quellen, Frame-Deny, nosniff, Permissions-Policy, kein `X-Powered-By` | `next.config.ts` |
| Datenhoheit | local-first, kein Cloud-LLM, keine Drittanbieter-Requests | CSP `connect-src 'self'` |
| Nachvollziehbare KI | Regelbaum mit Evidenz und Prüfschritten, Scope-Guard, Steuerungs-Verweigerung | `src/lib/rca/rules.ts`, `src/lib/copilot/` |
| Wissensmodell | Plant Brain: persistenter Graph Konzern → Sensor/Tag, SAP, Ersatzteile, Dokumente, Alarme, Tickets | `src/lib/graph/` |
| Anlagengedächtnis | Industrial Memory, append-only, mit Fotos, Freigaben und Ergebnissen | `src/lib/memory/` |
| Multi-Site + Mandanten | 5 Rollen, Mandantentrennung, Werkwechsel, KPIs je Ebene | `docs/SECURITY.md`, `/enterprise` |
| Analytik mit Erklärung | Predictive (ohne Fake-RUL), Quality AI, Energie, Cross-Plant, Explainable-AI-Panel | `src/lib/predictive|quality|energy|crossplant` |
| Wirtschaftlichkeit | ROI-Engine mit Annahmen, Value-Ledger nur aus verifizierten Ergebnissen | `src/lib/roi/` |
| Instandhaltung | Wartungsplaner mit Teile-Umlagerung, SAP-Adapter (Demo + OData, nicht validiert), Vier-Augen | `src/lib/maintenance|sap` |
| SSO | OIDC/Entra ID mit PKCE + JWKS-Prüfung (nicht validiert gegen Kunden-Tenant) | `src/lib/auth/oidc.ts` |
| Qualitätssicherung | 57 Unit-Tests, 127 Smoke-Checks, Mobile-Prüfung, CI bei jedem Push | `npm test`, `npm run smoke` |

## 2. Roadmap bis zum Konzern-Pilot (priorisiert)

1. **Edge-Agent-Paket** (Node, systemd) mit S7-Treiber (nur Lesen) und **OPC UA**-Client. OPC UA ist bei Krones-, KHS- und Sidel-Linien Standard. Weitere Punkte: Store-and-forward bei Netzausfall, ausschließlich ausgehendes HTTPS.
2. **SSO-Validierung** gegen den Entra-Tenant des Kunden, danach Benutzerverwaltung per SCIM (Implementierung vorhanden).
3. **Persistenz:** PostgreSQL/TimescaleDB statt Datei-Store, hinter den bestehenden Store-Schnittstellen (Mandantentrennung ist bereits umgesetzt).
4. **Linien-Standards:** Mapping auf **PackML / OMAC** und Weihenstephaner Standards (WS Pack/Food), damit OEE und Stillstandsgründe herstellerübergreifend vergleichbar werden.
5. **Integration:** Tickets nach SAP PM / Maximo (nur Anlage, keine Auftragsfreigabe), Export nach Historian (PI / AVEVA).
6. **Betrieb:** Container-Image, Helm-Chart, Backup/Restore, Observability (OpenTelemetry), definierte RPO/RTO.
7. **Compliance-Nachweise:** IEC 62443-Zonenkonzept (Edge in Zone 3 / DMZ), Pentest-Bericht, ISO-27001-Prozesse, DSGVO-Verarbeitungsverzeichnis (Schicht-Benutzerdaten).
8. **Diagnose-Ausbau:** lernende Baselines je Anlage, Stillstands-Pareto, Formatwechsel-Analyse (SMED), Energie je Einheit.

## 3. Pilot-Vorschlag (8 Wochen, eine Linie)

| Woche | Ergebnis |
|---|---|
| 1–2 | Edge-Agent im OT-Netz, Symbolliste importiert, Freigabe durch OT-Security |
| 3–4 | Echte Werte in Live/Twin/Historie, Baselines, Meldungen kalibriert |
| 5–6 | Schichtübergabe und Tickets im Alltag, Audit-Review |
| 7–8 | OEE-Vergleich vorher/nachher, Wertbeitrag mit echten Daten statt Beispielrechnung |

Erfolgskriterien vorab festlegen: z. B. weniger ungeplante Stopps, kürzere Diagnosezeit bis zur Ursache, vollständige Übergaben.

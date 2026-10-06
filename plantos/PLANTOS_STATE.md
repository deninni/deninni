# plantOS · Projektstatus

> Stand 2026-10-05. Diese Datei ersetzt die angefragte `WORKOS_STATE.md`, weil das Produkt jetzt plantOS heißt.
> Hinweis: Im Repository gab es weder `WORKOS_STATE.md` noch `WORKOS_ADVANCED_ROADMAP.md`, noch einen SAP-Adapter. Alles unten wurde in diesem Repository gebaut.

**Status-Legende**
- **implementiert**: Backend-Logik, Datenmodell, UI und Tests sind vorhanden.
- **implementiert, kundenseitig nicht validiert**: Adapter, Tests und Demo-Fallback sind vorhanden, es gibt aber keinen Kundenzugang zum Validieren.
- **vorbereitet**: Architektur bzw. Konfiguration sind vorhanden, die Funktion ist nicht aktiv.
- **nicht implementiert**

**Datenherkunft:** Alle Mess- und Betriebsdaten stammen aus der deterministischen Demo-Engine und sind als **DEMO** gekennzeichnet. Es ist keine Kunden-SPS und kein Kunden-SAP angebunden.

## Prüfstand (letzter Lauf)

| Prüfung | Ergebnis |
|---|---|
| `npm install` | ok |
| `npm run typecheck` (TypeScript strict) | ok |
| `npm test` (Unit, Berechnung, Isolation, Rechte, Edge Cases) | **57/57 grün** |
| `npm run build` (Production) | ok |
| `npm run smoke`: API, Seiten, RBAC, Mandantentrennung, Vier-Augen, Sitzungs-Widerruf, Copilot-Quellen | **127/127 grün**, wiederholbar |
| Mobile (iPhone-Viewport 390 px, Touch): 22 Seiten | kein horizontales Scrollen, Mehr-Menü, Werkwechsel und Copilot bedienbar, keine Konsolenfehler |
| Login | Passwort-Login für 6 Demo-Benutzer in 2 Mandanten; OIDC-Endpunkt antwortet ohne Konfiguration mit 501 |
| Trennung real/simuliert | Badges DEMO/SIMULATED_EDGE/S7_EDGE; Simulation kennzeichnet Messwert/Modellwert/Annahme/Simulation; ROI weist DEMO-Werte getrennt aus |

## Funktionsblöcke

| # | Block | Status | Wo | Tests |
|---|---|---|---|---|
| 1 | **Plant Brain / Knowledge Graph**: 23 Knotentypen (Unternehmen bis AI-Erkenntnis), 12 Beziehungstypen, persistent je Mandant, Anlagenbaum, Relationsgraph, Asset-Detail, Historie, Suche, Filter, Demo-Migration ohne Verlust von Nutzerdaten | implementiert | `/brain`, `src/lib/graph/*`, `/api/brain/*` | brain.test (7), smoke |
| 2 | **Industrial Memory**: 16 Eintragstypen, Pflichtfelder, append-only, Korrekturen per `supersedes`, Fotos (2 MB), Confidence-Pflicht bei AI, Links zu Ticket/Alarm/SAP; wird von Predictive, Cross-Plant, ROI und Copilot genutzt | implementiert | Asset → Historie, `src/lib/memory/*`, `/api/memory` | brain.test, smoke |
| 3 | **ROI-Engine**: Kosten bei Nicht-Handeln, Maßnahmenkosten, vermiedene Kosten, Netto, ROI, Confidence, Annahmen mit Herkunft; konfigurierbar (auch je Werk); Value Generated für Heute/Woche/Monat/Jahr und je Werk/Linie/Maschine, nur aus verifizierten Ergebnissen, DEMO getrennt | implementiert | `/value`, `src/lib/roi/*` | brain.test, analytics.test |
| 4 | **Predictive Maintenance**: Trendregression über Tagesmediane (Schwingung, Temperatur, Strom, Druck, Leistung), Grenzwerte mit Quelle, Laufzeit seit Wartung (aus Memory), Schaltzyklen, Alarmhistorie, Risiko, Priorität, Wartungsfenster. RUL nur bei belastbarem Trend, sonst wörtlich „Nicht genügend Daten für eine belastbare Restlebensdauerprognose.“ | implementiert | `/predictive`, Asset → Prognose | analytics.test (3) |
| 5 | **Multi-Site**: Konzern → Region → Land → (Standort) → Werk → Bereich → Linie → Maschine; KPIs je Ebene; Werkwechsel (Cookie, gegen Mandant validiert); Demo-Struktur mit 4 Werken, 10 Maschinen, als DEMO gekennzeichnet | implementiert | `/enterprise`, Werk-Wechsler | analytics.test (Rollup), smoke |
| 6 | **Copilot-Ausbau**: Warum steht X, kritische Maschinen, fehlende Ersatzteile, teuerste Linie, wiederkehrende Fehler, Wartung diese Woche, Energiepotenzial, ähnliche Ausfälle; Antworten aus Graph, Memory, Telemetrie, Alerts, SAP-Bestand, Tickets, Predictive und ROI, immer mit Quellen; Scope-Guard läuft zuerst | implementiert | `/ai`, `src/lib/copilot/enterprise.ts` | analytics.test, smoke (6 Fragen) |
| 7 | **Cross-Plant Learning**: Signatur aus 7 Merkmalen, Kosinus + Maschinentyp + Komponente + Alarmrate; Ursache und Maßnahme des Referenzfalls; je Mandant schaltbar; nie mandantenübergreifend | implementiert | Asset → Ähnliche Fälle, `/enterprise` (Schalter) | analytics.test |
| 8 | **Quality AI**: Dezil-Schwellen + Welch-Test, beste Kombination zweier Parameter, Produkt/Schicht; Confidence, Ursache, empfohlener Bereich, Kosten pro Tag; keine automatische Änderung | implementiert (Rezept nur als Format, keine Bedienparameter-Logs) | `/quality` | analytics.test |
| 9 | **Energy Optimization**: kWh je Maschine/Linie/Einheit, Leerlauf, 15-min-Spitze, ungewöhnliche Stromaufnahme (z-Test), Ineffizienztrend, Ist/Soll (Soll = bestes Dezil), Potenzial pro Tag/Jahr mit Annahme und Risiko | implementiert (Leistung aus Strom berechnet, kein Energiezähler) | `/energy` | analytics.test |
| 10 | **Maintenance Planner**: Risiko + Ersatzteile + Lieferzeit + **Umlagerung aus anderen Werken** + Wartungsfenster je Werk + Techniker + Dauer; Termin, Teile, Risiko bei Verschiebung, Stillstand, Kosten; Freigabe Werkleitung, SAP nur vorbereitet | implementiert | `/maintenance` | analytics.test (3), smoke |
| 11 | **Digital Twin / Simulation**: Linienmodell mit Bandgeschwindigkeit, Drehmoment, Beschleunigung, Motorlast, Produktstabilität, Puffer, Stau, Taktzeit, Durchsatz und Energie; jede Größe gekennzeichnet; Messwert serverseitig geprüft; 3D-Twin bleibt bestehen | implementiert | `/simulation` | analytics.test |
| 12 | **Executive Dashboard**: OEE, Stillstände, Top-Risiken, Predictive Alerts, Wartung, Ersatzteile, Qualität, Energie, ROI, offene Maßnahmen, Trend Woche/14 Tage/Monat; Multi-Site | implementiert | `/executive` | smoke |
| 13 | **Enterprise Security**: 5 Rollen + Rechte-Matrix, Tenant Isolation, API-Autorisierung je Recht, signierte Sessions mit Widerruf, Rate Limits, Secrets inkl. `_FILE` | implementiert | `docs/SECURITY.md`, `/settings` | analytics.test, smoke |
| 13a | **OIDC / Entra ID** (PKCE, JWKS-Signatur, Rollen-Mapping) | implementiert, kundenseitig nicht validiert | `/api/auth/oidc/*` | analytics.test (Signatur, aud, nonce, exp, Manipulation) |
| 13b | **SAML** | vorbereitet (Architektur dokumentiert, nicht implementiert) | `docs/SECURITY.md` | – |
| 14 | **Audit Trail**: append-only + SHA-256-Hash-Kette, Integritätsprüfung in der UI; protokolliert Login, Konfiguration, Alerts, Tickets, Wartung, SAP, AI-Bestätigung, Simulation, Export, Discovery | implementiert (Benutzerverwaltung existiert noch nicht, daher keine Benutzeränderungs-Events) | `/audit` | analytics.test (Manipulation erkannt) |
| 15 | **Reports**: Schicht, Tag, Woche, Monat, Wartung, ROI, Energie, Management Summary, jeweils mit PDF | implementiert | `/reports` | analytics.test (alle 8 + PDF), smoke |
| 16 | **Discovery (sicher)**: IO-Liste (CSV), EPLAN-CSV, TIA/Step7, OPC-UA-NodeSet2-XML, Edge-Browse-JSON; Vorschläge mit Confidence; Übernahme nur nach Bestätigung; keine Scans, keine Schreibzugriffe | implementiert (Excel nur als CSV, Live-OPC-UA-Browse nur über Edge-Agent, nicht im Repo) | `/discovery` | analytics.test (2), smoke |
| – | **SAP-Adapter**: Demo-Adapter (Bestand aus Plant Brain) + S/4HANA OData (Materialbestand, Instandhaltungsmeldung mit CSRF-Token), Schreibsperre per Konfiguration, Vier-Augen | implementiert, kundenseitig nicht validiert | `src/lib/sap/*`, `/maintenance` | analytics.test (gemocktes OData), smoke |
| – | **Explainable AI**: einheitliches Erklärungsobjekt (Daten, Zeitraum, Begründung, Confidence ≤ 95 %, Alternativen, fehlende Daten, ähnliche Fälle, nächste Prüfung) für Prognose, Qualität und Energie | implementiert | `ExplainPanel` | analytics.test |
| 19 | **Mobile**: Bottom-Navigation + Mehr-Menü (Dialog), Werkwechsler, horizontal scrollbare Tabs/Tabellen, Touch-Ziele ≥ 44 px auf Touch-Geräten, keine Hover-Abhängigkeit | implementiert | – | Playwright-Prüfung |

## Bekannte Grenzen (ehrlich)
- Keine echten Kundendaten: Alle Werte sind DEMO-Engine-Werte, die Demo-Historie ist als DEMO markiert.
- Datei-Store statt Datenbank. Für den Konzernbetrieb ist PostgreSQL/TimescaleDB vorgesehen (Roadmap).
- Kein Edge-Agent-Paket im Repo. Die Ingest-API ist fertig.
- Es gibt keine Benutzerverwaltungs-UI. Benutzer sind Demo-Konten; produktiv wird SSO genutzt.
- Prognosen, Qualität und Energie sind statistische Heuristiken, keine zertifizierten Modelle.

## Nächste Schritte (Vorschlag)
1. Edge-Agent mit OPC-UA-/S7-Lesetreiber und Store-and-Forward
2. PostgreSQL/TimescaleDB-Persistenz hinter den bestehenden Store-Schnittstellen
3. OIDC-Validierung gegen einen Kunden-Entra-Tenant
4. Benutzerverwaltung (SCIM) mit Audit
5. PackML-/Weihenstephan-Zustandsmodell

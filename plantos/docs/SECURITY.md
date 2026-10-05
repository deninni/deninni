# plantOS · Sicherheitsarchitektur

**Grundsatz: READ ONLY gegenüber Maschinen.** Keine Rolle kann in eine SPS schreiben, Sollwerte setzen oder abschalten. Alle Rechte unten betreffen ausschließlich plantOS-Daten.

## Authentifizierung

| Verfahren | Status | Details |
|---|---|---|
| Demo-Passwort | implementiert | timing-sicherer Vergleich, Rate-Limit 8 Versuche / 5 min, Audit von Fehlversuchen |
| Sitzung | implementiert | HMAC-SHA256-signiertes Cookie (httpOnly, SameSite=Lax, Secure unter HTTPS), Ablauf konfigurierbar (Default 12 h), Sitzungs-ID mit serverseitigem Widerruf beim Logout |
| OIDC / Microsoft Entra ID | implementiert, **nicht gegen echten Entra-Tenant validiert** | Authorization Code + PKCE (S256), State + Nonce, ID-Token-Prüfung (RS256 über JWKS, iss, aud, exp, nonce), Gruppen/App-Rollen → plantOS-Rolle. Ohne Konfiguration antwortet `/api/auth/oidc/start` mit 501 |
| SAML 2.0 | **Architektur dokumentiert, nicht implementiert** | siehe unten |

### SAML-Architektur (geplant)
1. plantOS als Service Provider. Metadaten werden unter `/api/auth/saml/metadata` bereitgestellt, das Signaturzertifikat kommt aus dem Secrets-Management.
2. Ablauf: SP-initiiert, HTTP-Redirect für den AuthnRequest, HTTP-POST für die Assertion an `/api/auth/saml/acs`.
3. Prüfungen: XML-Signatur (Assertion **und** Response, XSW-Schutz durch strikte ID-Referenzen), `Audience`, `Recipient`, `NotOnOrAfter`, InResponseTo gegen den gespeicherten Request sowie Replay-Cache.
4. Attribut-Mapping wie bei OIDC (`groups` → Rolle). Danach wird dieselbe signierte plantOS-Sitzung ausgestellt.
5. Empfehlung: Wo möglich OIDC nutzen; Entra ID unterstützt beides.

## Autorisierung (RBAC)

Fünf Rollen: **Viewer < Operator < Instandhalter < Werkleiter < Admin**. Jede schreibende API prüft genau ein Recht (`requireCap`):

| Recht | ab Rolle |
|---|---|
| read, simulation.run | Viewer |
| alert.ack, ticket.create, memory.comment | Operator |
| memory.write, graph.write, maintenance.confirm, ai.confirm, sap.prepare, discovery.confirm | Instandhalter |
| maintenance.approve, roi.config, sap.execute, audit.read | Werkleiter |
| tenant.config | Admin |

Zusätzlich:
- **Vier-Augen-Prinzip für SAP:** Wer eine SAP-Aktion vorbereitet, darf sie nicht ausführen.
- **Explizite Bestätigung:** Für die Ausführung ist `confirm=true` erforderlich.
- **Schreib-Rate-Limit:** 60 schreibende Aufrufe pro Minute und Benutzer.

## Mandantentrennung (Tenant Isolation)
- Jede Sitzung trägt einen `tenant`. Alle Daten liegen getrennt unter `data/tenants/<tenant>/` (Graph, Memory, ROI-Konfiguration, SAP-Aktionen, Discovery, Audit, Tickets).
- Die Tenant-ID wird per Regex validiert, damit kein Path-Traversal möglich ist. Store-Namen kommen aus einer festen Liste.
- Kanten im Graphen dürfen nur Knoten desselben Tenants verbinden. Scope-Wechsel und Asset-Zugriffe werden gegen den eigenen Graphen geprüft und liefern sonst 404 bzw. 400.
- Cross-Plant-Learning vergleicht nur innerhalb eines Tenants und ist je Tenant abschaltbar. Es gibt kein Modelltraining über Mandantengrenzen.
- Nachweis: Unit-Tests (`brain.test.ts`, `analytics.test.ts`) und `scripts/smoke.sh`, Abschnitt „Mandantentrennung“.

## Audit-Trail
- Append-only (JSON Lines) je Tenant mit **SHA-256-Hash-Kette**. Jede Änderung oder Löschung eines Eintrags wird von `verifyAudit()` erkannt. Die Audit-Seite zeigt den Integritätsstatus an.
- Protokolliert werden unter anderem:
  - Login (ok, fehlgeschlagen, gesperrt, SSO) und Logout
  - `config.change` (ROI-Annahmen mit Vorher/Nachher, Tenant-Einstellungen)
  - Alarm bestätigt/kommentiert/geschlossen, Ticket erstellt oder erneut gemeldet
  - `maintenance.approved`/`confirmed`, `ai.recommendation.confirmed`
  - `sap.prepared`/`executed`/`rejected`, `simulation.run`, `report.export`, `discovery.import`/`confirm`
  - Graph-Änderungen und verweigerte Steuerbefehle an den Copilot
- Grenze: Eine Hash-Kette erkennt Manipulation, verhindert sie aber nicht. Für Produktion wird zusätzlich ein WORM-Speicher bzw. eine externe Signatur empfohlen.

## Secrets
- Zentral in `src/lib/config/secrets.ts`. Werte kommen aus ENV oder aus `<NAME>_FILE` (Docker- bzw. Kubernetes-Secrets).
- Die UI zeigt nur den Status (gesetzt, stark genug, aus Datei), nie die Werte.
- Einschränkung: Die Middleware läuft in der Edge-Runtime und liest `PLANTOS_SESSION_SECRET` deshalb nur aus ENV.

## Web-Härtung
CSP ohne externe Quellen, `X-Frame-Options: DENY`, `nosniff`, Permissions-Policy, kein `X-Powered-By`, Upload-Limits (Foto 2 MB, Importe 3 MB, JSON 4 MB), Foto-Typen nur JPEG/PNG/WebP, Medienauslieferung nur nach Hash-Dateinamen.

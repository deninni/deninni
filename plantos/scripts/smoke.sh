#!/usr/bin/env bash
# plantOS API-Smoke gegen einen laufenden Server (Default http://localhost:3000).
# Prüft Auth, Rollen, Schreibschutz, Edge-Ehrlichkeit, Tickets/Dedupe, Übergabe-PDF.
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
JAR="$(mktemp)"; VJAR="$(mktemp)"
fail=0
check() { # name expected actual
  if [[ "$2" == "$3" ]]; then echo "  ok   $1"; else echo "  FAIL $1 (erwartet $2, war $3)"; fail=1; fi
}
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

echo "plantOS Smoke gegen $BASE"
check "health" 200 "$(code "$BASE/api/health")"
check "api ohne login → 401" 401 "$(code "$BASE/api/live")"
check "login falsch → 401" 401 "$(code -X POST -H 'content-type: application/json' -d '{"email":"demo@plantos.local","password":"x"}' "$BASE/api/auth/login")"
check "login admin" 200 "$(code -c "$JAR" -X POST -H 'content-type: application/json' -d '{"email":"demo@plantos.local","password":"plantos-demo"}' "$BASE/api/auth/login")"
check "login viewer" 200 "$(code -c "$VJAR" -X POST -H 'content-type: application/json' -d '{"email":"viewer@plantos.local","password":"plantos-viewer"}' "$BASE/api/auth/login")"
check "gefälschtes Cookie → 401" 401 "$(code -H 'cookie: plantos_session=eyJzdWIiOiJ4Iiwicm9sZSI6ImFkbWluIn0.AAAA' "$BASE/api/live")"

for p in /dashboard /anlagen /anlagen/m-af12 /digital-twin /live /historie /connect /ai /simulation /handover /alerts /tickets /reports /settings /sales-demo /audit; do
  check "seite $p" 200 "$(code -b "$JAR" "$BASE$p")"
done
for p in /api/live /api/machines/m-af12/live /api/machines/m-vl3/twin /api/machines/m-ft7/history /api/machines/m-ft7/rca /api/alerts /api/tickets /api/handover /api/edge/plants /api/data/status /api/diagnostics/connector-suspicion; do
  check "api $p" 200 "$(code -b "$JAR" "$BASE$p")"
done
check "unbekannte Anlage → 404" 404 "$(code -b "$JAR" "$BASE/api/machines/m-xx/live")"

echo "Schreibschutz"
check "connect/write → 403" 403 "$(code -b "$JAR" -X POST "$BASE/api/connect/write")"
check "edge/write → 403" 403 "$(code -b "$JAR" -X POST "$BASE/api/edge/write")"
check "telemetrie mit setpoint → 400" 400 "$(code -b "$JAR" -X POST -H 'content-type: application/json' -d '{"machineId":"m-af12","values":{"motor_setpoint":1}}' "$BASE/api/edge/telemetry")"
check "S7_EDGE ohne Adresse → 400" 400 "$(code -b "$JAR" -X POST -H 'content-type: application/json' -d '{"machineId":"m-af12","origin":"S7_EDGE","values":{"temperatureC":50}}' "$BASE/api/edge/telemetry")"
check "SIMULATED_EDGE ok" 200 "$(code -b "$JAR" -X POST -H 'content-type: application/json' -d '{"machineId":"m-vl3","agentId":"smoke","origin":"SIMULATED_EDGE","values":{"temperatureC":50}}' "$BASE/api/edge/telemetry")"
src=$(curl -s -b "$JAR" "$BASE/api/machines/m-vl3/live" | grep -o '"source":"[A-Z_]*"' | head -1)
check "VL-3 Quelle bleibt SIMULATED_EDGE" '"source":"SIMULATED_EDGE"' "$src"

echo "Rollen & Tickets"
check "viewer darf kein Ticket → 403" 403 "$(code -b "$VJAR" -X POST -H 'content-type: application/json' -d '{"title":"Test"}' "$BASE/api/tickets")"
check "viewer kein Audit → 403" 403 "$(code -b "$VJAR" "$BASE/api/audit")"
RUN="SMOKE-$(date +%s)"
T="{\"title\":\"[RCA] $RUN · AF-12 · Smoke-Test\",\"machineId\":\"m-af12\"}"
check "ticket anlegen → 201" 201 "$(code -b "$JAR" -X POST -H 'content-type: application/json' -d "$T" "$BASE/api/tickets")"
d=$(curl -s -b "$JAR" -X POST -H 'content-type: application/json' -d "$T" "$BASE/api/tickets" | grep -o '"deduped":true' || true)
check "gleiches RCA-Ticket → dedupe" '"deduped":true' "$d"

echo "Copilot"
r=$(curl -s -b "$JAR" -X POST -H 'content-type: application/json' -d '{"message":"Schalte die FT-7 ab"}' "$BASE/api/ai/chat" | grep -o '"kind":"control-refusal"' || true)
check "Steuerwunsch abgelehnt" '"kind":"control-refusal"' "$r"

echo "Übergabe-PDF"
ct=$(curl -s -b "$JAR" -o /dev/null -w "%{content_type}" "$BASE/api/handover/pdf")
check "PDF content-type" "application/pdf" "$ct"
head=$(curl -s -b "$JAR" "$BASE/api/handover/pdf" | head -c 8)
check "PDF Kopf" "%PDF-1.4" "$head"

login() { # jar email pw
  code -c "$1" -X POST -H 'content-type: application/json' -d "{\"email\":\"$2\",\"password\":\"$3\"}" "$BASE/api/auth/login"
}
post() { # jar url json [method]
  code -b "$1" -X "${4:-POST}" -H 'content-type: application/json' -d "$3" "$BASE$2"
}
WL="$(mktemp)"; IH="$(mktemp)"; OP="$(mktemp)"; AC="$(mktemp)"; LO="$(mktemp)"
trap 'rm -f "$JAR" "$VJAR" "$WL" "$IH" "$OP" "$AC" "$LO"' EXIT
check "login werkleiter" 200 "$(login "$WL" werkleiter@plantos.local plantos-werkleiter)"
check "login instandhaltung" 200 "$(login "$IH" instandhaltung@plantos.local plantos-instandhaltung)"
check "login operator" 200 "$(login "$OP" schicht@plantos.local plantos-schicht)"
check "login acme (2. Mandant)" 200 "$(login "$AC" admin@acme.test plantos-acme)"

echo "Neue Seiten"
for p in /brain /brain/m-sued-fb03-motor /executive /enterprise /predictive /quality /energy /value /maintenance /discovery /simulation /reports /settings /audit; do
  check "seite $p" 200 "$(code -b "$JAR" "$BASE$p")"
done

echo "Plant Brain / Memory / Analytik (API)"
for p in "/api/brain/tree" "/api/brain/nodes?q=M12" "/api/brain/nodes/m-sued-fb03-motor" "/api/memory?assetId=m-poz-af31&descendants=1" "/api/predictive" "/api/predictive/m-sued-af24" "/api/crossplant/m-sued-af24" "/api/quality/m-af12" "/api/energy" "/api/energy/m-vl3" "/api/enterprise?depth=2" "/api/enterprise/trend?days=7" "/api/roi/value" "/api/roi/config" "/api/maintenance/plan" "/api/sap/actions" "/api/scope" "/api/simulation/line?assetId=m-af12" "/api/reports/week" "/api/tenant"; do
  check "api $p" 200 "$(code -b "$JAR" "$BASE$p")"
done
m12=$(curl -s -b "$JAR" "$BASE/api/brain/nodes/m-sued-fb03-motor" | grep -o '"code":"DB12.DBD4"' | head -1)
check "M12 Messwert aus DB12.DBD4" '"code":"DB12.DBD4"' "$m12"
nr=$(curl -s -b "$JAR" "$BASE/api/predictive/m-vl3" | grep -o 'Nicht genügend Daten für eine belastbare Restlebensdauerprognose' | head -1)
check "keine Fake-RUL ohne Trend" "Nicht genügend Daten für eine belastbare Restlebensdauerprognose" "$nr"
check "Report-PDF" "%PDF-1.4" "$(curl -s -b "$JAR" "$BASE/api/reports/management?format=pdf" | head -c 8)"
check "unbekannter Report → 404" 404 "$(code -b "$JAR" "$BASE/api/reports/foo")"

echo "Mandantentrennung"
check "acme sieht Demo-Asset nicht" 404 "$(code -b "$AC" "$BASE/api/brain/nodes/m-af12")"
check "acme Memory fremdes Asset" 404 "$(code -b "$AC" "$BASE/api/memory?assetId=m-af12")"
check "acme Prognose fremdes Asset" 404 "$(code -b "$AC" "$BASE/api/predictive/m-sued-af24")"
check "acme Scope fremdes Werk" 400 "$(post "$AC" /api/scope '{"scope":"pl-nord"}')"
check "acme kann nicht an fremdes Asset schreiben" 404 "$(post "$AC" /api/memory '{"assetId":"m-af12","type":"repair","description":"fremd"}')"
cnt=$(curl -s -b "$AC" "$BASE/api/brain/nodes?type=machine" | grep -o '"type":"machine"' | wc -l | tr -d ' ')
check "acme sieht nur eigene Maschine" 1 "$cnt"
check "acme Tickets leer (eigener Store)" '{"tickets":[]}' "$(curl -s -b "$AC" "$BASE/api/tickets")"

echo "Rechte (RBAC)"
check "viewer: kein Kommentar" 403 "$(post "$VJAR" /api/memory '{"assetId":"m-af12","type":"technicianComment","description":"test"}')"
check "operator: Kommentar ok" 201 "$(post "$OP" /api/memory '{"assetId":"m-af12","type":"technicianComment","description":"Smoke-Kommentar"}')"
check "operator: keine Reparatur" 403 "$(post "$OP" /api/memory '{"assetId":"m-af12","type":"repair","description":"test"}')"
check "instandhaltung: Reparatur ok" 201 "$(post "$IH" /api/memory '{"assetId":"m-af12-motor","type":"repair","description":"Smoke-Reparatur"}')"
check "AI-Eintrag ohne Confidence → 400" 400 "$(post "$IH" /api/memory '{"assetId":"m-af12","type":"aiRecommendation","description":"x y z"}')"
check "viewer: ROI-Annahmen nicht ändern" 403 "$(post "$VJAR" /api/roi/config '{"energyPricePerKwh":0.2}' PATCH)"
check "werkleiter: ROI-Annahmen ändern" 200 "$(post "$WL" /api/roi/config '{"energyPricePerKwh":0.2}' PATCH)"
check "ROI ungültiger Wert → 400" 400 "$(post "$WL" /api/roi/config '{"energyPricePerKwh":-5}' PATCH)"
check "instandhaltung: keine Wartungsfreigabe" 403 "$(post "$IH" /api/maintenance/approve '{"assetId":"m-sued-af24"}')"
check "werkleiter: Freigabe + SAP vorbereiten" 201 "$(post "$WL" /api/maintenance/approve '{"assetId":"m-sued-af24","prepareSap":true}')"
sap=$(curl -s -b "$WL" "$BASE/api/sap/actions" | grep -o '"id":"sap-[a-z0-9]*"' | head -1 | cut -d'"' -f4)
check "SAP: Vier-Augen (eigene Aktion)" 409 "$(post "$WL" "/api/sap/actions/$sap" '{"decision":"execute","confirm":true}')"
check "SAP: instandhaltung darf nicht ausführen" 403 "$(post "$IH" "/api/sap/actions/$sap" '{"decision":"execute","confirm":true}')"
check "SAP: ohne confirm → 400" 400 "$(post "$JAR" "/api/sap/actions/$sap" '{"decision":"execute"}')"
check "SAP: admin führt aus (Demo-Adapter)" 200 "$(post "$JAR" "/api/sap/actions/$sap" '{"decision":"execute","confirm":true}')"
check "werkleiter: Tenant-Konfig verboten" 403 "$(post "$WL" /api/tenant '{"crossPlantLearning":false}' PATCH)"
check "admin: Tenant-Konfig" 200 "$(post "$JAR" /api/tenant '{"crossPlantLearning":true}' PATCH)"
check "viewer: Simulation erlaubt" 200 "$(post "$VJAR" /api/simulation/line '{"input":{"beltSpeedMs":1.4},"assetId":"m-af12"}')"
check "viewer: kein Discovery-Import" 403 "$(post "$VJAR" /api/discovery '{"format":"tia","text":"Name;Adresse\nM1;DB1.DBD0","scopeId":"m-af12"}')"
check "instandhaltung: Discovery-Import" 201 "$(post "$IH" /api/discovery '{"format":"tia","text":"Name;Adresse;Datentyp;Kommentar\nM12;DB12.DBD60;REAL;Strom","scopeId":"m-sued-fb03"}')"
check "viewer: kein Audit" 403 "$(code -b "$VJAR" "$BASE/api/audit")"
integ=$(curl -s -b "$WL" "$BASE/api/audit" | grep -o '"integrity":{"ok":true' | head -1)
check "Audit-Integrität (Hash-Kette)" '"integrity":{"ok":true' "$integ"
check "viewer: kein Graph-Schreiben" 403 "$(post "$VJAR" /api/brain/nodes '{"type":"document","name":"x"}')"
check "OIDC ohne Konfiguration → 501" 501 "$(code "$BASE/api/auth/oidc/start")"

echo "Copilot (erweitert)"
for q in "Welche Maschinen sind aktuell kritisch?" "Welche Ersatzteile fehlen?" "Welche Linie verursacht die meisten Kosten?" "Welche Wartung sollte diese Woche geplant werden?" "Wo gibt es Energiepotenzial?" "Welche Maschine ähnelt einem früheren Ausfall?"; do
  src=$(curl -s -b "$JAR" -X POST -H 'content-type: application/json' -d "{\"message\":\"$q\"}" "$BASE/api/ai/chat" | grep -o '"sources":\[[^]]*\]' | head -1)
  [[ -n "$src" && "$src" != '"sources":[]' ]] && echo "  ok   copilot: $q" || { echo "  FAIL copilot: $q"; fail=1; }
done

echo "Sitzungs-Widerruf"
check "login für Logout-Test" 200 "$(login "$LO" viewer@plantos.local plantos-viewer)"
cp "$LO" "$LO.old"
code -b "$LO" -c "$LO" -X POST "$BASE/api/auth/logout" >/dev/null
check "altes Cookie nach Logout ungültig" 401 "$(code -b "$LO.old" "$BASE/api/tickets")"
rm -f "$LO.old"

if [[ $fail -eq 0 ]]; then echo "SMOKE OK"; else echo "SMOKE FEHLGESCHLAGEN"; exit 1; fi

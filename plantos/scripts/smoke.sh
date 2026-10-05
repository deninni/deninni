#!/usr/bin/env bash
# plantOS API-Smoke gegen einen laufenden Server (Default http://localhost:3000).
# Prüft Auth, Rollen, Schreibschutz, Edge-Ehrlichkeit, Tickets/Dedupe, Übergabe-PDF.
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
JAR="$(mktemp)"; VJAR="$(mktemp)"; trap 'rm -f "$JAR" "$VJAR"' EXIT
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

if [[ $fail -eq 0 ]]; then echo "SMOKE OK"; else echo "SMOKE FEHLGESCHLAGEN"; exit 1; fi

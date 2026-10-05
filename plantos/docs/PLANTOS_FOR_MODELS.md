# plantOS Industrial AI: Briefing für Modelle

> Übergabe-Briefing für jede KI, die plantOS weiterbaut oder erklärt. Vorher hieß das Produkt **WerkOS**. Der Name ist jetzt überall **plantOS**.
> Wenn Code und diese Datei sich widersprechen, gilt der Code. Behaupte nichts, was hier als „nicht vorhanden“ markiert ist.

## Regeln (nicht verhandelbar)

- **SPS nur lesen.** `POST /api/connect/write` und `/api/edge/write` antworten immer mit 403. Telemetrie mit Schreib-Form wird mit 400 abgelehnt.
- **Trust: Supervised.** Melden und Tickets anlegen ist erlaubt. Abschaltung, Sollwert und Bestellung gibt es nicht ohne Freigabe.
- **DEMO ist Default.** Die Werte kommen aus `src/lib/demo/engine.ts` (deterministisch nach Zeitpunkt), solange kein Edge-Sample vorliegt, das höchstens 15 s alt ist.
- **SIMULATED_EDGE ≠ S7_EDGE.** S7 gilt nur mit S7-Adressen oder `readProof`. Das ist eine Formprüfung.
- **Copilot lokal.** Regelbasiert, kein Cloud-LLM. Der Scope-Guard läuft immer zuerst, auch bei trennbaren Verben („Schalte … ab“).
- **Ruhige Seiten.** Pro Seite ein Thema und höchstens ein Status. Zusatzzahlen gehören hinter `MehrZahlen` („mehr Zahlen“).
- **3D ist Stilisierung.** Kein CAD, kein 1:1.
- **Kein Deployment** ohne ausdrückliche Freigabe.

## Stack

Next.js 15.5 (App Router), React 19.1, TypeScript strict, Tailwind 4, three 0.186 + @react-three/fiber 9 + drei 10, recharts 3, lucide-react. Tests laufen mit node:test über tsx.

## Struktur

- `src/lib/`: Fachlogik ohne UI. Wichtig sind `demo/engine.ts`, `auth/{session,roles,users,server}.ts`, `plc/{tag-write-guard,edge-protocol,edge-state,symbol-list}.ts`, `diagnostics/connector-suspicion.ts` (TT-214: Score 45, Stufe „verdacht“), `tickets/{dedupe,create}.ts`, `rca/rules.ts`, `copilot/{scope,answer}.ts`, `handover/{build,pdf}.ts`, `twin/{layouts,physics,health}.ts`, `history/anomaly.ts`, `alerts.ts`, `audit.ts`, `store/store.ts`.
- `src/app/(app)/…`: geschützte Seiten. `src/app/api/…`: Route-Handler. `src/middleware.ts` prüft die Session-Signatur.
- `src/components/twin/scene3d/`: `TwinCanvas` sowie die Szenen `Af12Scene`, `Vl3Scene`, `Ft7Scene` und `shared.tsx` (PBR-Materialien, Förderband, Motor, Sensor-Stele, Instanced-Flaschen).

## Design-Tokens

| Token | Wert |
|---|---|
| Hintergrund | `#0a0e14` |
| Karte | `#11161e` |
| Rahmen | `#1c2430` |
| Text | `#e6eaef` |
| Muted | `#8b93a0` |
| Akzent | `#5a8fa3` (nur für aktive Elemente und Selektion) |
| Status ok / warn / fault | `#3d9b72` / `#c9a227` / `#c45c5c` |

Schrift ist Geist. Radien sind klein (0,19–0,5 rem). 3D-Labels zeigen nur den Kurznamen (Text vor „·“, maximal 18 Zeichen).

## Kurz-Prompt

```text
Du arbeitest an plantOS Industrial AI (plantos/, Next.js 15, React 19, Tailwind 4, R3F).
Regeln: SPS nur lesen; Trust Supervised; DEMO ist Default; SIMULATED_EDGE ist nie S7;
Copilot lokal; ruhige Seiten (MehrZahlen); 3D ist Stilisierung. Vor Commit: npm run typecheck,
npm test, npm run build, npm run smoke. Login demo@plantos.local / plantos-demo. Nichts deployen.
```

/**
 * Scope-Guard des Anlagen-Copilots: nur Anlagenfragen, keine Steuerung.
 * Läuft immer zuerst – auch bevor jemals ein LLM angebunden wird.
 */
export const PLANT_SCOPE_REFUSAL =
  "Nur Anlagenfragen. Ich beantworte Fragen zu Anlagen, Meldungen, Ursachen, Tickets, OEE und Schichtübergabe in diesem Werk.";
export const CONTROL_REFUSAL =
  "Nein. plantOS-Trust: Supervised. Ich kann melden und Tickets anlegen, aber nicht abschalten, keine Sollwerte schreiben und nichts bestellen. Freigabe und Eingriff macht der Mensch vor Ort.";

const PLANT_WORDS = /(anlage|maschine|linie|af-?12|vl-?3|ft-?7|füller|fueller|sternrad|motor|antrieb|sensor|temperatur|strom|vibration|schwingung|oee|ausschuss|meldung|alarm|alert|störung|stoerung|ticket|rca|ursache|schicht|übergabe|uebergabe|sps|plc|edge|tunnel|band|förder|foerder|sorter|flasche|format|kipp|stecker|tt-?214|wartung|instandhaltung|status|leistung|ausbringung|verfügbarkeit|qualität|zustand|werk\b|produktion|m-?001|pumpe|ventil|etikett|verschließ|packer|spüler|ersatzteil|energie|verbrauch|kosten|kritisch|ausfall|fehler|wartung|werk|af-?\d+|fb\d+|m\d+)/i;
const OFF_TOPIC = /(wetter|politik|wahl|fußball|fussball|rezept|witz|aktie|bitcoin|promi|film|serie|urlaub|horoskop|hauptstadt|präsident|praesident|bundeskanzler)/i;
const CONTROL = /(stopp|stoppe|stop\b|abschalt|ausschalt|anhalten|herunterfahr|shutdown|schreib|setze|sollwert|setpoint|erhöhe|erhoehe|senke|reduzier|starte|einschalt|override|forcier|force\b|bestell|auftrag erteil|tausch(e)? den sensor|sensor tauschen)/i;

/** Trennbare Verben: „Schalte X ab“, „Fahr die Linie herunter“, „Stell den Sollwert … ein“. */
const CONTROL_SPLIT = /\b(schalt\w*|stell\w*|fahr\w*|setz\w*|nimm|mach\w*)\b.*\b(ab|aus|an|ein|herunter|runter|hoch|außer betrieb|ausser betrieb)\s*[.!?]?$/i;

export type ScopeClass = "plant" | "control" | "offtopic";

export function classifyPlantScope(q: string): ScopeClass {
  const text = q.trim();
  if (!text) return "offtopic";
  if (CONTROL.test(text) || CONTROL_SPLIT.test(text)) return "control";
  if (OFF_TOPIC.test(text) && !PLANT_WORDS.test(text)) return "offtopic";
  if (PLANT_WORDS.test(text)) return "plant";
  return "offtopic";
}

export function wantsTicketFromRca(q: string): boolean {
  return /ticket\s+(aus|zur|zu(r)?|für|fuer)\s+(der\s+)?(rca|ursache)/i.test(q);
}

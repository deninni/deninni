"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-[50vh] place-items-center px-4 text-center">
      <div>
        <div className="label-section">Fehler</div>
        <h1 className="mt-1 text-lg font-semibold">Diese Ansicht konnte nicht geladen werden.</h1>
        <p className="mt-1 text-[13px] text-muted">Die Anlage ist davon nicht betroffen – plantOS liest nur.</p>
        <button onClick={reset} className="mt-3 rounded-md border border-border px-3 py-1.5 text-[13px]">Erneut versuchen</button>
      </div>
    </div>
  );
}

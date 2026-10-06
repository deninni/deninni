import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <div className="label-section">404</div>
        <h1 className="mt-1 text-xl font-semibold">Seite nicht gefunden</h1>
        <Link href="/dashboard" className="mt-3 inline-block text-[13px] text-accent hover:underline">Zum Dashboard</Link>
      </div>
    </div>
  );
}

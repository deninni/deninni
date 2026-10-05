import { Suspense } from "react";
import { TwinView } from "./TwinView";

export const metadata = { title: "Digital Twin" };

export default function DigitalTwinPage() {
  return (
    <Suspense fallback={<div className="card twin-hero-h animate-pulse" />}>
      <TwinView />
    </Suspense>
  );
}

import type { TwinPayload, Health } from "@/lib/twin/health";

export interface SceneProps {
  twin: TwinPayload;
  selected: string | null;
  onSelect: (id: string) => void;
  showSensors: boolean;
  showLabels: boolean;
  bottleBudget: number;
  playing: boolean;
}

export type { Health };

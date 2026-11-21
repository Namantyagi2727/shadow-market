import type { Stage } from "@/lib/contracts";
import type { PersonaState, RunState } from "@/lib/run-store";

export interface Office3DSceneProps {
  runState: RunState;
  activeStage: Stage;
  isSampleData?: boolean;
  onOpenHotseat: (persona: PersonaState) => void;
}

export type RoomId =
  | "overview"
  | "pitch"
  | "boardroom"
  | "server"
  | "lab"
  | "market"
  | "verdict"
  | "judges";

export type ChibiPose = "stand" | "sit" | "talk" | "type" | "walk";

export type StatusRingKind =
  | "none"
  | "working"
  | "converted"
  | "quit"
  | "speaking";

export interface RoomTabMeta {
  id: RoomId;
  label: string;
  shortLabel: string;
  accent: string;
}

export const ROOM_TABS: RoomTabMeta[] = [
  { id: "overview", label: "Whole Office", shortLabel: "All", accent: "#e2e8f0" },
  { id: "pitch", label: "Pitch Studio", shortLabel: "Pitch", accent: "#EF9F27" },
  { id: "boardroom", label: "Boardroom", shortLabel: "Boardroom", accent: "#38bdf8" },
  { id: "server", label: "Server Room", shortLabel: "Build", accent: "#34d399" },
  { id: "lab", label: "Usability Lab", shortLabel: "Lab", accent: "#5DCAA5" },
  { id: "market", label: "Market Floor", shortLabel: "Market", accent: "#a78bfa" },
  { id: "verdict", label: "Verdict Room", shortLabel: "Verdict", accent: "#fb7185" },
  { id: "judges", label: "Judges' Room", shortLabel: "Judges", accent: "#60a5fa" },
];

export function stageToRoom(stage: Stage | string): RoomId {
  switch (stage) {
    case "pitch":
      return "pitch";
    case "boardroom":
      return "boardroom";
    case "build":
      return "server";
    case "lab":
      return "lab";
    case "swarm":
      return "market";
    case "verdict":
      return "verdict";
    case "room":
    case "reality":
      return "judges";
    default:
      return "overview";
  }
}

export interface CameraViewSpec {
  target: [number, number, number];
  distance: number;
  elevationRatio: number;
  azimuth: number;
}

/**
 * Camera framing per room, anchored to the approved reference look
 * (PerspectiveCamera FOV 30, azimuth ~0.85 rad, elevationRatio ~0.62).
 */
export const CAMERA_VIEWS: Record<RoomId, CameraViewSpec> = {
  overview: {
    target: [0, 1.0, 0.2],
    distance: 44,
    elevationRatio: 0.62,
    azimuth: 0.85,
  },
  pitch: {
    target: [-10.5, 2.0, -6.2],
    distance: 15.5,
    elevationRatio: 0.56,
    azimuth: 0.82,
  },
  boardroom: {
    target: [-0.3, 1.6, -6.2],
    distance: 14.5,
    elevationRatio: 0.58,
    azimuth: 0.85,
  },
  server: {
    target: [-11.8, 1.6, 5.6],
    distance: 15.0,
    elevationRatio: 0.58,
    azimuth: 0.82,
  },
  lab: {
    target: [10.3, 1.5, -6.0],
    distance: 15.5,
    elevationRatio: 0.6,
    azimuth: 0.86,
  },
  market: {
    target: [-3.7, 1.4, 5.6],
    distance: 15.0,
    elevationRatio: 0.62,
    azimuth: 0.85,
  },
  verdict: {
    target: [4.3, 1.8, 5.2],
    distance: 14.5,
    elevationRatio: 0.55,
    azimuth: 0.85,
  },
  judges: {
    target: [12.0, 1.6, 5.4],
    distance: 14.5,
    elevationRatio: 0.56,
    azimuth: 0.86,
  },
};

export const STATUS_RING_COLORS: Record<Exclude<StatusRingKind, "none">, string> = {
  working: "#f59e0b",
  converted: "#34d399",
  quit: "#f43f5e",
  speaking: "#38bdf8",
};

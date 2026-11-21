import dynamic from "next/dynamic";

export type { Office3DSceneProps, RoomId } from "./types";

export const Office3D = dynamic(
  () => import("./Office3DScene").then((m) => m.Office3DScene),
  { ssr: false }
);

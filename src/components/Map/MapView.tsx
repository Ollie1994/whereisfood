import type { Ref } from "react";

interface MapViewProps {
  ref: Ref<HTMLDivElement>;
}

export default function MapView({ ref }: MapViewProps) {
  return <div ref={ref} className="relative h-screen w-full" />;
}

import type { Ref } from "react";

interface MapViewProps {
  ref: Ref<HTMLDivElement>;
}

export default function MapView({ ref }: MapViewProps) {
  return <div ref={ref} className="absolute inset-0" />;
}

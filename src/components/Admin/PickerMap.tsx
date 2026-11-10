import { useRef } from "react";
import { usePickerMap } from "@/hooks/usePickerMap";
import type { Pin } from "@/lib/admin-place";

export interface PickerMapProps {
  pin: Pin | null;
  onTap: (latitude: number, longitude: number) => void;
}

// The place picker's map. `PlacePicker` loads it through `next/dynamic` when the admin opens
// it, so MapLibre isn't fetched with the admin screen.
export default function PickerMap({ pin, onTap }: PickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  usePickerMap(containerRef, pin, onTap);
  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-md border border-foreground/30" />;
}

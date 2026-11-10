import { useRef } from "react";
import { ALERT } from "@/components/Admin/styles";
import { usePickerMap } from "@/hooks/usePickerMap";
import { PICKER_TEXTS, type Pin } from "@/lib/admin-place";

export interface PickerMapProps {
  pin: Pin | null;
  onTap: (latitude: number, longitude: number) => void;
}

// The place picker's map. `PlacePicker` loads it through `next/dynamic` when the admin opens
// it, so MapLibre isn't fetched with the admin screen. A browser that can't draw it gets a
// message, and the picker's other ways still work.
export default function PickerMap({ pin, onTap }: PickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const failed = usePickerMap(containerRef, pin, onTap);
  if (failed) {
    return (
      <p role="alert" className={ALERT}>
        {PICKER_TEXTS.mapUnsupported}
      </p>
    );
  }
  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-md border border-foreground/30" />;
}

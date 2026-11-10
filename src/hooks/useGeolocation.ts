import { useState } from "react";
import { GEO_ERRORS, geoError } from "@/lib/admin-place";

export type GeoFix = { ok: true; latitude: number; longitude: number } | { ok: false; error: string };

// "Jag är här nu": one fresh position from the browser, or a Swedish reason. Browsers offer
// it only in a secure context (HTTPS, or this machine's own address), so a phone tries it on
// the preview.
export function useGeolocation() {
  const [locating, setLocating] = useState(false);

  function locate(): Promise<GeoFix> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return Promise.resolve({ ok: false, error: GEO_ERRORS.unsupported });
    }
    setLocating(true);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocating(false);
          resolve({ ok: true, latitude: position.coords.latitude, longitude: position.coords.longitude });
        },
        (error) => {
          setLocating(false);
          resolve({ ok: false, error: geoError(error.code) });
        },
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
      );
    });
  }

  return { locate, locating };
}

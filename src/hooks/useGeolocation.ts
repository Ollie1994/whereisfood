import { useState } from "react";
import { GEO_ERRORS, geoError } from "@/lib/admin-place";

export type GeoFix = { ok: true; latitude: number; longitude: number } | { ok: false; error: string };

// "Jag är här nu": one fresh position from the browser, or a Swedish reason. Browsers offer
// it only in a secure context (MDN, "Geolocation API"), so a phone tries it on the preview's
// HTTPS; Chrome gave a position at `http://127.0.0.1:3000` (the owner's check, #229).
//
// A limit: while the browser's permission question is left unanswered, neither callback
// runs (the Geolocation spec's `timeout` leaves out the time spent asking), so the button
// waits on "Hämtar position…" until it's answered.
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

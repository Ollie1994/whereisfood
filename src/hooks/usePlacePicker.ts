import { useEffect, useRef, useState } from "react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { adminFetch } from "@/lib/admin-api";
import { type FormValues, placeValues, recentValues } from "@/lib/admin-form";
import { PICKER_TEXTS, pinFrom, recentPlaceList } from "@/lib/admin-place";
import type { RecentPlace } from "@/lib/services/locations";
import { SPOTS } from "@/lib/spots";

// The place picker's state (Phase 7 plan, step 9): the chosen truck's recent places, the
// map's open state, and the refusal of a tap or GPS fix outside the Gothenburg box. The
// values are the form's (`useLocationForm`), filled through `onFill`: a spot sets the pin
// and the name, a recent place its times too, a map tap or GPS fix the pin alone (#23, #35).

type Recent = { truckId: string; places: RecentPlace[] | null };

export type PlacePickerState = {
  // The chosen truck's recent places, or null with no truck, while they load, or on a failure.
  recentPlaces: RecentPlace[] | null;
  recentLoading: boolean;
  recentError: string | null;
  retryRecent: () => void;
  pickSpot: (name: string) => void;
  pickRecent: (place: RecentPlace) => void;
  mapOpen: boolean;
  toggleMap: () => void;
  tapMap: (latitude: number, longitude: number) => void;
  locate: () => Promise<void>;
  locating: boolean;
  // Why a tap or GPS fix didn't fill the form, until the next pick or the form's next refill.
  message: string | null;
};

export function usePlacePicker({
  truckId,
  generation,
  saves,
  timesLocked,
  onFill,
}: {
  truckId: string;
  // `useLocationForm`'s: a change means the form now holds another entry, or a fresh one.
  generation: number;
  // `useLocationForm`'s count of saves, after which a truck's places are read again.
  saves: number;
  // The form's times are read-only, so a recent place leaves them.
  timesLocked: boolean;
  onFill: (fields: Partial<FormValues>) => void;
}): PlacePickerState {
  const [recent, setRecent] = useState<Recent | null>(null);
  const [retries, setRetries] = useState(0);
  const [mapOpen, setMapOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The generation the message belongs to: a refill clears it during render, as
  // `useLocationForm` refills its values, with no effect.
  const [messageFor, setMessageFor] = useState(generation);
  // The GPS request whose fix may still fill the form, or null once it may not: the form was
  // refilled, or a spot, recent place or map tap was picked while the phone was locating.
  const pendingFix = useRef<object | null>(null);
  const geolocation = useGeolocation();

  if (generation !== messageFor) {
    setMessageFor(generation);
    setMessage(null);
  }

  useEffect(() => {
    pendingFix.current = null;
  }, [generation]);

  // Read again when the truck changes, after a save (a place may have been added), and on
  // "Försök igen". An answer for a truck no longer chosen is dropped, and a failed re-read
  // keeps the truck's last good list.
  useEffect(() => {
    if (!truckId) return;
    let current = true;
    void adminFetch<{ places?: unknown }>(`/api/admin/places?truckId=${encodeURIComponent(truckId)}`).then(
      (result) => {
        if (!current) return;
        const places = result.ok ? recentPlaceList(result.data.places) : null;
        setRecent((last) => (!places && last?.truckId === truckId && last.places ? last : { truckId, places }));
      },
    );
    return () => {
      current = false;
    };
  }, [truckId, saves, retries]);

  const shown = truckId && recent?.truckId === truckId ? recent : null;

  // The pin, or the reason it can't be one; true when the form got it.
  function pin(latitude: number, longitude: number): boolean {
    const result = pinFrom(latitude, longitude);
    setMessage(result.ok ? null : result.error);
    if (result.ok) onFill({ pin: result.pin });
    return result.ok;
  }

  return {
    recentPlaces: shown ? shown.places : null,
    recentLoading: Boolean(truckId) && !shown,
    recentError: shown && !shown.places ? PICKER_TEXTS.recentFailed : null,
    retryRecent: () => {
      setRecent(null);
      setRetries((count) => count + 1);
    },
    pickSpot: (name) => {
      const spot = SPOTS.find((candidate) => candidate.name === name);
      if (!spot) return;
      pendingFix.current = null;
      setMessage(null);
      onFill(placeValues({ latitude: spot.latitude, longitude: spot.longitude, label: spot.name }));
    },
    pickRecent: (place) => {
      pendingFix.current = null;
      setMessage(null);
      onFill(timesLocked ? placeValues(place) : recentValues(place));
    },
    mapOpen,
    toggleMap: () => setMapOpen((open) => !open),
    tapMap: (latitude, longitude) => {
      pendingFix.current = null;
      pin(latitude, longitude);
    },
    // The map opens on the fix, so the admin sees where the phone thinks it is.
    locate: async () => {
      if (geolocation.locating) return;
      const request = {};
      pendingFix.current = request;
      setMessage(null);
      const fix = await geolocation.locate();
      if (pendingFix.current !== request) return;
      pendingFix.current = null;
      if (!fix.ok) setMessage(fix.error);
      else if (pin(fix.latitude, fix.longitude)) setMapOpen(true);
    },
    locating: geolocation.locating,
    message,
  };
}

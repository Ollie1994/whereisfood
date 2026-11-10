import { useEffect, useState } from "react";
import { useGeolocation } from "@/hooks/useGeolocation";
import { adminFetch } from "@/lib/admin-api";
import { PICKER_TEXTS, type Pin, pinFrom, placeList } from "@/lib/admin-place";
import type { Place } from "@/lib/services/locations";
import { SPOTS } from "@/lib/spots";

// The place picker's state (Phase 7 plan, step 9): the chosen truck's recent places, the
// map's open state, and the refusal of a tap or GPS fix outside the Gothenburg box. The
// pin and the name are the form's (`useLocationForm`): a spot or recent place sets both
// (`onPlace`), a map tap or GPS fix the pin alone (`onPin`), as plan #35 sets.

type Recent = { truckId: string; places: Place[] | null };

export type PlacePickerState = {
  // The chosen truck's recent places, or null with no truck, while they load, or on a failure.
  recentPlaces: Place[] | null;
  recentLoading: boolean;
  recentError: string | null;
  pickSpot: (name: string) => void;
  pickPlace: (place: Place) => void;
  mapOpen: boolean;
  toggleMap: () => void;
  tapMap: (latitude: number, longitude: number) => void;
  locate: () => Promise<void>;
  locating: boolean;
  // Why a tap or GPS fix didn't fill the form, until the next pick.
  message: string | null;
};

export function usePlacePicker({
  truckId,
  onPin,
  onPlace,
}: {
  truckId: string;
  onPin: (pin: Pin) => void;
  onPlace: (place: Place) => void;
}): PlacePickerState {
  const [recent, setRecent] = useState<Recent | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const geolocation = useGeolocation();

  // Read again when the truck changes. An answer for a truck no longer chosen is dropped.
  useEffect(() => {
    if (!truckId) return;
    let current = true;
    void adminFetch<{ places?: unknown }>(`/api/admin/places?truckId=${encodeURIComponent(truckId)}`).then(
      (result) => {
        if (current) setRecent({ truckId, places: result.ok ? placeList(result.data.places) : null });
      },
    );
    return () => {
      current = false;
    };
  }, [truckId]);

  const shown = truckId && recent?.truckId === truckId ? recent : null;

  // The pin, or the reason it can't be one; true when the form got it.
  function pin(latitude: number, longitude: number): boolean {
    const result = pinFrom(latitude, longitude);
    setMessage(result.ok ? null : result.error);
    if (result.ok) onPin(result.pin);
    return result.ok;
  }

  function pickPlace(place: Place) {
    setMessage(null);
    onPlace(place);
  }

  return {
    recentPlaces: shown ? shown.places : null,
    recentLoading: Boolean(truckId) && !shown,
    recentError: shown && !shown.places ? PICKER_TEXTS.recentFailed : null,
    pickSpot: (name) => {
      const spot = SPOTS.find((candidate) => candidate.name === name);
      if (spot) pickPlace({ latitude: spot.latitude, longitude: spot.longitude, label: spot.name });
    },
    pickPlace,
    mapOpen,
    toggleMap: () => setMapOpen((open) => !open),
    tapMap: (latitude, longitude) => void pin(latitude, longitude),
    // The map opens on the fix, so the admin sees where the phone thinks it is.
    locate: async () => {
      if (geolocation.locating) return;
      setMessage(null);
      const fix = await geolocation.locate();
      if (!fix.ok) setMessage(fix.error);
      else if (pin(fix.latitude, fix.longitude)) setMapOpen(true);
    },
    locating: geolocation.locating,
    message,
  };
}

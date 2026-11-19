import { useEffect, useRef } from "react";

// A ref whose element takes focus once, when it mounts: the error pages' heading or message
// (IS #438), so a screen reader reads it and keyboard focus moves to the page. The element
// needs `tabIndex={-1}`, since a heading or paragraph can't take focus otherwise.
//
// On a "Försök igen" that throws again, focus came back to the heading (and to `/map`'s
// message): the error page mounted again. A limit: on one that succeeds, focus fell to
// `<body>` (both in headless Chrome on `npm start`, IS #438's PR).
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

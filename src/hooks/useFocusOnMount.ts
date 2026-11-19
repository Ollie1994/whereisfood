import { useEffect, useRef } from "react";

// A ref whose element takes focus once, when it mounts: the error pages' heading or message
// (IS #438), so a screen reader reads it and keyboard focus moves to the page. The element
// needs `tabIndex={-1}`, since a heading or paragraph can't take focus otherwise.
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

// Probe for IS #324 round 1, never merged: a type error and a lint error in one file.
export const n: number = "x";

export function sink(el: HTMLElement, s: string) {
  el.innerHTML = s;
}

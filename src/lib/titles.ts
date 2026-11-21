// The pages' titles: the page's name first, then the app (the owner's pattern and wording, IS
// #452, PR #477). One copy here, so a new page or another city changes one line. The root
// layout's `title.template` builds them for pages under it; a title in the root segment itself
// (the root `not-found.tsx`) and the client error pages, which can't export `metadata`, build
// theirs with `pageTitle` (Next 16.4's `generate-metadata.md`: a layout's template applies to
// child segments only). The admin's are `adminTitle`, under `title.absolute`.
export const SITE_TITLE = "Väm | Var är maten i Göteborg";
export const ADMIN_TITLE = "Admin | Väm";

export function pageTitle(name: string): string {
  return `${name} | ${SITE_TITLE}`;
}

export function adminTitle(name: string): string {
  return `${name} | ${ADMIN_TITLE}`;
}

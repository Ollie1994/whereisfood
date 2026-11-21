// The pages' titles: the page's name first, then the app (the owner's pattern and wording, IS
// #452, PR #477). One copy here, so a new page or another city changes one line. The root
// layout's `title.template` builds them for pages under it; a title in the root segment itself
// (the root `not-found.tsx`) and the client error pages, which can't export `metadata`, build
// theirs with `pageTitle` (Next 16.4's `generate-metadata.md`: a layout's template applies to
// child segments only). The admin's: `ADMIN_TITLE` under `title.absolute` in its layout, with
// `adminTitle("%s")` as the template for pages below it, and `adminTitle` in its error and 404
// pages. A title on `admin/page.tsx` itself, in the layout's own segment, gets the root's public
// template, so it would need `title.absolute` with `adminTitle`.
export const SITE_TITLE = "Väm | Var är maten i Göteborg";
export const ADMIN_TITLE = "Admin | Väm";

export function pageTitle(name: string): string {
  return `${name} | ${SITE_TITLE}`;
}

export function adminTitle(name: string): string {
  return `${name} | ${ADMIN_TITLE}`;
}

// Väm's public contact and account (IS #483): the removal contact `/integritet` names (plan open
// decision 4, IS #456) and the Instagram account the public pages' footer links to. A change here
// is a change to the owner-approved text that shows it (`/integritet`, PR #476; `/om`, IS #483)
// and to `PublicShell`'s footer: `git grep -n "CONTACT\|INSTAGRAM_" src` lists them. The handle
// and the URL name the same account, so they change together. `RUNBOOK.md`'s "Telling a new
// truck" writes both texts' address and handle out, and "Other requests" the handle (IS #511):
// `git grep -n "vararmaten" -- RUNBOOK.md` lists them.
export const CONTACT = "vararmaten@proton.me";
export const INSTAGRAM_HANDLE = "@vararmaten";
export const INSTAGRAM_URL = "https://www.instagram.com/vararmaten/";

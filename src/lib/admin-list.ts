// How far ahead the admin's list reads, from the start of today (Phase 7 plan, #24). Its own
// module, so the service (`listAdminEntries`) and the browser's form (`savedText`) both read
// it without either depending on the other.
export const LIST_DAYS = 14;

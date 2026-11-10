import { ALERT, SMALL_BUTTON } from "@/components/Admin/styles";
import type { ChecklistState } from "@/hooks/useChecklist";
import { CHECKLIST_EMPTY, fromText } from "@/lib/admin-checklist";
import { UNKNOWN_PLACE, entryTimeText } from "@/lib/admin-form";

// The morning checklist (Phase 7 plan, step 11): each suggestion with ✓, which enters it as an
// ordinary entry, and ✗, which hides it on this device today. `now` is the list's clock.
export default function Checklist({ checklist, now }: { checklist: ChecklistState; now: Date }) {
  const { checklist: read, shown, errors, busyIds, reload, confirm, dismiss } = checklist;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Checklista</h2>
      {errors.read && (
        <div className="flex flex-col gap-2">
          <p role="alert" className={ALERT}>
            {errors.read}
          </p>
          <button type="button" onClick={reload} className={`self-start ${SMALL_BUTTON}`}>
            Försök igen
          </button>
        </div>
      )}
      {errors.action && (
        <p role="alert" className={ALERT}>
          {errors.action}
        </p>
      )}
      {read === null ? (
        !errors.read && <p className="text-sm text-foreground/70">Hämtar…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-foreground/70">{CHECKLIST_EMPTY}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((suggestion) => {
            const busy = busyIds.includes(suggestion.from_id);
            return (
              <li key={suggestion.from_id} className="flex flex-col gap-2 rounded-md border border-foreground/20 p-3">
                <div className="flex flex-col">
                  <span className="font-medium">{suggestion.truck_name}</span>
                  <span className="text-sm">
                    {suggestion.label ?? UNKNOWN_PLACE}, {entryTimeText(suggestion, now)}
                  </span>
                  <span className="text-xs text-foreground/60">{fromText(suggestion, read.day)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void confirm(suggestion)} disabled={busy} className={SMALL_BUTTON}>
                    {busy ? "Sparar…" : "✓ Stämmer"}
                  </button>
                  <button type="button" onClick={() => dismiss(suggestion)} disabled={busy} className={SMALL_BUTTON}>
                    ✗ Inte idag
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

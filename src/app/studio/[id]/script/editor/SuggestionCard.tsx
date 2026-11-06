import { changesNumberWords, type EditSuggestion } from "@/agents/editorRules";
import { fill } from "../scriptDraft";
import { partLabel } from "./editorDraft";
import t from "./strings.fa.json";

interface SuggestionCardProps {
  /** Unique per card; the ids of the card's parts start with it. */
  id: string;
  n: number;
  suggestion: EditSuggestion;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

// One suggestion with a tick, drawn like the hook cards on the script page. Its texts are read-only:
// the model only suggests and code applies, and a text is changed by hand only on the script page.
export function SuggestionCard({ id, n, suggestion, checked, onChange }: SuggestionCardProps) {
  const warn = changesNumberWords(suggestion.from, suggestion.to);
  // The whole card is read with the checkbox: its part, the change, the reason and any warning.
  const describedBy = [`${id}-part`, `${id}-change`, `${id}-reason`, ...(warn ? [`${id}-warning`] : [])].join(" ");

  return (
    <div className="group flex flex-col gap-3 p-5 ring-1 ring-concrete ring-inset has-checked:bg-surface has-checked:ring-2 has-checked:ring-cream has-checked:[--ui-text-muted:var(--ui-surface-text-muted)]">
      <label className="flex cursor-pointer items-center gap-3 self-start has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cream">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={describedBy}
          className="sr-only"
        />
        <span
          aria-hidden="true"
          className="flex size-5 shrink-0 items-center justify-center ring-2 ring-concrete ring-inset group-has-checked:bg-cream group-has-checked:ring-cream"
        >
          <svg viewBox="0 0 12 12" className="size-3 text-navy opacity-0 group-has-checked:opacity-100">
            <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
        <span className="font-heading text-h3">{fill(t.suggestions.accept, { n })}</span>
      </label>

      <p id={`${id}-part`} className="text-caption text-muted">
        {partLabel(suggestion.part)}
      </p>
      {/* «قبل» and «بعد» are words; the lighter and bolder text is only an extra cue. */}
      <dl id={`${id}-change`} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-caption text-muted">{t.before}</dt>
        <dd className="text-muted">{suggestion.from}</dd>
        <dt className="text-caption">{t.after}</dt>
        <dd className="font-bold">{suggestion.to}</dd>
      </dl>
      <p id={`${id}-reason`}>
        <span className="text-caption text-muted">{t.suggestions.reason}: </span>
        {suggestion.reason}
      </p>
      {/* Cream, not red: live red fails contrast on the denim of a ticked card. */}
      {warn && (
        <p id={`${id}-warning`} className="text-caption">
          {t.suggestions.numberWarning}
        </p>
      )}
    </div>
  );
}

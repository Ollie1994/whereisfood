// Väm's temporary logo (IS #481): option A from the owner's logo canvas, "Väm" drawn in lines,
// the same drawing as `src/app/icon.svg`. Beside the text "Var är maten" (the owner's call), it is
// the heading's only "Väm", so it is labelled "Väm" for screen readers.
// Presentation attributes, not `style`, so the admin pages' nonce CSP admits it (`CLAUDE.md`,
// "Security headers").
export default function VamLogo({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Väm"
      focusable="false"
    >
      <circle cx="50" cy="50" r="50" fill="#17191F" />
      <g
        fill="none"
        stroke="#FFF4E0"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="14,37 24,64 34,37" />
        <circle cx="47" cy="55.5" r="8.5" />
        <line x1="55.5" y1="47" x2="55.5" y2="64" />
        <path d="M65 64 V53 a6 6 0 0 1 12 0 V64 M77 53 a6 6 0 0 1 12 0 V64" />
      </g>
      <circle cx="43" cy="37.5" r="3.4" fill="#F5A524" />
      <circle cx="52" cy="37.5" r="3.4" fill="#F5A524" />
    </svg>
  );
}

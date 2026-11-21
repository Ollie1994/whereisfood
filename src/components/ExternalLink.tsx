// A link to another site, opened in a new tab (the owner's call on IS #483). `noopener` keeps the
// new page from reaching this one through `window.opener`, and `noreferrer` sends no referrer.
// The hidden text tells a screen reader that it opens a new tab.
export default function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="sr-only"> (öppnas i en ny flik)</span>
    </a>
  );
}

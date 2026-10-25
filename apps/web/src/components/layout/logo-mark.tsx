export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <circle cx="9" cy="16" r="2.5" className="fill-primary-foreground" />
      <circle cx="23" cy="9" r="2.5" className="fill-primary-foreground" />
      <circle cx="23" cy="23" r="2.5" className="fill-primary-foreground" />
      <path
        d="M11.2 15l9.6-5M11.2 17l9.6 5"
        className="stroke-primary-foreground"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
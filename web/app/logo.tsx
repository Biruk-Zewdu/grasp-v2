// The Grasp mark: two overlapping circles whose intersection (the lens) is filled
// — "tension preserved: two views, one shared truth." Strokes use currentColor so
// the mark inherits text color; the lens is a fixed muted fill. Pure SVG, no deps.

export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label="Grasp"
      fill="none"
    >
      <defs>
        <clipPath id="grasp-lens">
          <circle cx="9" cy="12" r="6.4" />
        </clipPath>
      </defs>
      {/* the shared lens — intersection of the two circles */}
      <circle
        cx="15"
        cy="12"
        r="6.4"
        clipPath="url(#grasp-lens)"
        className="fill-neutral-300"
      />
      {/* the two views */}
      <circle cx="9" cy="12" r="6.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="12" r="6.4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Mark + wordmark lockup, for the header.
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={"flex items-center gap-2 " + className}>
      <Logo className="h-6 w-6 text-neutral-900" />
      <span className="text-base font-semibold tracking-tight text-neutral-900">grasp</span>
    </span>
  );
}

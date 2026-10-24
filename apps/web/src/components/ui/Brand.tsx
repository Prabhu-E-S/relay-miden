export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap font-semibold tracking-tight">
      <svg
        viewBox="0 0 42 34"
        fill="none"
        className={compact ? 'h-7 w-8' : 'h-9 w-10'}
        aria-hidden="true"
      >
        <path
          d="M3 29 16 6l12 23M18 17l8-13 13 25"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <path
          d="m16 17 4 6h-5l5 8"
          stroke="var(--color-action)"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
      </svg>
      <span className={compact ? 'text-base' : 'text-lg'}>Relay Miden</span>
    </span>
  );
}

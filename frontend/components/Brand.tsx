'use client';

interface BrandProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  responsive?: boolean;
  className?: string;
}

export default function Brand({
  size = 'md',
  showText = true,
  responsive = false,
  className = '',
}: BrandProps) {
  const iconSize = { sm: 16, md: 18, lg: 22 }[size];
  const textClass = {
    sm: 'text-[13px]',
    md: 'text-[14px]',
    lg: 'text-[15px]',
  }[size];

  return (
    <div className={`flex items-center gap-2 text-white ${className}`}>
      <span className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 via-fuchsia-400 to-cyan-300 p-[1px] shadow-[0_12px_34px_-18px_rgba(217,70,239,0.9)]">
        <span className="inline-flex items-center justify-center rounded-[11px] bg-slate-950/70 p-1 text-fuchsia-100 backdrop-blur-xl">
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="2.5" />
            <circle cx="6" cy="18" r="2.5" />
            <path d="M18 8.5a9 9 0 0 1-9 9" />
          </svg>
        </span>
      </span>
      {showText && (
        <span
          className={`font-semibold tracking-[-0.015em] ${textClass} ${
            responsive ? 'hidden sm:inline' : ''
          }`}
        >
          Research Git
        </span>
      )}
    </div>
  );
}

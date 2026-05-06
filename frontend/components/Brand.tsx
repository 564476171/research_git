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
  const iconClass = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-7 w-7',
  }[size];

  const textClass = {
    sm: 'text-[13px]',
    md: 'text-[14px]',
    lg: 'text-[15px]',
  }[size];

  return (
    <div className={`flex items-center gap-2 text-[var(--text-primary)] ${className}`}>
      <span className={`relative inline-flex items-center justify-center ${iconClass}`} aria-hidden="true">
        <span className="absolute inset-0 rounded-[32%] border border-[rgba(204,120,92,0.2)] bg-[var(--surface-bg-strong)]" />
        <span className="absolute left-[27%] top-[18%] h-[46%] w-[14%] rounded-full bg-[var(--text-primary)]" />
        <span className="absolute right-[18%] top-[22%] h-[28%] w-[28%] rounded-full border-[2px] border-[var(--accent-primary)]" />
        <span className="absolute left-[26%] bottom-[17%] h-[28%] w-[28%] rounded-full border-[2px] border-[var(--text-primary)]" />
        <span className="absolute left-[40%] top-[47%] h-[2px] w-[34%] rounded-full bg-[var(--accent-primary)]" />
        <span className="absolute left-[37%] top-[35%] h-[22%] w-[2px] rounded-full bg-[var(--accent-primary)]" />
      </span>
      {showText && (
        <span className={`font-medium tracking-[-0.02em] ${textClass}`} aria-label="Research Git">
          {responsive ? (
            <>
              <span aria-hidden="true" className="text-[var(--accent-primary)] sm:hidden">RG</span>
              <span className="sr-only sm:not-sr-only sm:inline">
                <span className="text-[var(--text-primary)]">Research</span>{' '}
                <span className="text-[var(--accent-primary)]">Git</span>
              </span>
            </>
          ) : (
            <>
              <span className="text-[var(--text-primary)]">Research</span>{' '}
              <span className="text-[var(--accent-primary)]">Git</span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

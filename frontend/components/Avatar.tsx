'use client';

import { toAbsoluteMediaUrl } from '@/lib/api';

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-[12px]',
  lg: 'h-14 w-14 text-[18px]',
  xl: 'h-24 w-24 text-[30px]',
};

function initials(name?: string | null, email?: string | null) {
  const value = (name || email || 'User').trim();
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return value.slice(0, 2).toUpperCase();
}

export default function Avatar({ src, name, email, size = 'md', className = '' }: AvatarProps) {
  const image = toAbsoluteMediaUrl(src);
  const label = name || email || 'User';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/10 font-semibold uppercase tracking-[-0.04em] text-white shadow-[0_18px_42px_-24px_rgba(0,0,0,0.8)] ${sizes[size]} ${className}`}
      aria-label={label}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={label} className="h-full w-full object-cover" />
      ) : (
        <span>{initials(name, email)}</span>
      )}
    </span>
  );
}

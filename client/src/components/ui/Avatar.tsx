import { useState } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Usage:
 *
 *   <Avatar name="Asha K." />
 *   <Avatar name="Rohit S." src="https://…" size="lg" />
 *
 * radius-full per docs/design/03-design-system.md §5 ("Avatars, status dots, pill badges
 * only"). Falls back to initials on missing/broken image — never a blank circle.
 */

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  name: string;
  src?: string;
  size?: AvatarSize;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-6 w-6 text-caption',
  md: 'h-9 w-9 text-body-sm',
  lg: 'h-12 w-12 text-body-md',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

export function Avatar({ name, src, size = 'md', className, ...props }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(src) && !imageFailed;

  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-brand-primary font-medium text-neutral-0',
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </span>
  );
}

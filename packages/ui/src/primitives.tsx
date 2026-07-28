'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown, Search } from 'lucide-react';
import * as React from 'react';
import { cn } from './cn';

// ── Badge ──────────────────────────────────────────────────────────────────

const badge = cva(
  'inline-flex items-center gap-1 rounded-pill font-medium tracking-tight [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        neutral: 'bg-bone-200 text-ink-600 ring-1 ring-inset ring-bone-300',
        brand: 'bg-brand-100 text-brand-700 ring-1 ring-inset ring-brand-200',
        clay: 'bg-clay-100 text-clay-700 ring-1 ring-inset ring-clay-200',
        success: 'bg-success-bg text-success-fg ring-1 ring-inset ring-success/20',
        warning: 'bg-warning-bg text-warning-fg ring-1 ring-inset ring-warning/20',
        danger: 'bg-danger-bg text-danger-fg ring-1 ring-inset ring-danger/20',
        info: 'bg-info-bg text-info-fg ring-1 ring-inset ring-info/20',
        solid: 'bg-ink-900 text-bone-50',
      },
      size: {
        sm: 'h-5 px-1.5 text-2xs [&_svg]:h-3 [&_svg]:w-3',
        md: 'h-6 px-2 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5',
        lg: 'h-7 px-2.5 text-sm [&_svg]:h-4 [&_svg]:w-4',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />;
}

// ── Input ──────────────────────────────────────────────────────────────────

export const inputClasses = cn(
  'w-full rounded-md border border-bone-400 bg-bone-50 px-3 text-ink-900',
  'placeholder:text-ink-300',
  'transition-colors duration-150',
  'outline-none focus:border-brand-500 focus:shadow-focus',
  'disabled:cursor-not-allowed disabled:bg-bone-200 disabled:text-ink-400',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_3px_rgb(168_50_50/0.22)]',
);

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { inputSize?: 'sm' | 'md' | 'tap' }
>(({ className, inputSize = 'md', ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      inputClasses,
      { sm: 'h-9 text-sm', md: 'h-11 text-base', tap: 'h-tap text-md' }[inputSize],
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(inputClasses, 'py-2.5 text-base', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { inputSize?: 'sm' | 'md' | 'tap' }
>(({ className, inputSize = 'md', children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        inputClasses,
        'appearance-none pr-9',
        { sm: 'h-9 text-sm', md: 'h-11 text-base', tap: 'h-tap text-md' }[inputSize],
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
      aria-hidden
    />
  </div>
));
Select.displayName = 'Select';

export function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <input type="search" className={cn(inputClasses, 'h-11 pl-9 text-base', className)} {...props} />
    </div>
  );
}

// ── Field wrapper ──────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="flex items-baseline gap-1 text-sm font-medium text-ink-700"
        >
          {label}
          {required && <span className="text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  className,
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  const id = React.useId();
  return (
    <label
      htmlFor={props.id ?? id}
      className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700"
    >
      <input
        id={props.id ?? id}
        type="checkbox"
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 rounded-xs border-bone-500 text-brand-600',
          'accent-brand-600 focus-visible:shadow-focus',
          className,
        )}
        {...props}
      />
      {label && <span className="leading-snug">{label}</span>}
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-center gap-2.5', disabled && 'opacity-50')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-pill transition-colors duration-200',
          'outline-none focus-visible:shadow-focus',
          checked ? 'bg-brand-600' : 'bg-bone-400',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-bone-50 shadow-sm transition-transform duration-200 ease-editorial',
            checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
          )}
        />
      </button>
      {label && <span className="text-sm text-ink-700">{label}</span>}
    </label>
  );
}

// ── Layout / display ───────────────────────────────────────────────────────

export function Divider({ className, label }: { className?: string; label?: string }) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <span className="h-px flex-1 bg-bone-300" />
        <span className="text-2xs uppercase tracking-widest text-ink-400">{label}</span>
        <span className="h-px flex-1 bg-bone-300" />
      </div>
    );
  }
  return <hr className={cn('border-0 border-t border-bone-300', className)} />;
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'neutral' | 'brand' | 'clay' | 'warning' | 'danger';
  icon?: React.ReactNode;
  className?: string;
}) {
  const toneClass = {
    neutral: 'text-ink-900',
    brand: 'text-brand-700',
    clay: 'text-clay-600',
    warning: 'text-warning-fg',
    danger: 'text-danger-fg',
  }[tone];

  return (
    <div className={cn('rounded-card border border-bone-300 bg-bone-50 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-widest text-ink-400">{label}</p>
        {icon && <span className="text-ink-300">{icon}</span>}
      </div>
      <p className={cn('mt-1.5 font-display text-2xl tabular-nums leading-none', toneClass)}>{value}</p>
      {sub && <p className="mt-1.5 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed border-bone-400 bg-bone-100/60 px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bone-200 text-ink-400">
          {icon}
        </div>
      )}
      <p className="font-display text-lg text-ink-800">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-bone-200', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-bone-100/70 to-transparent" />
    </div>
  );
}

export function Avatar({
  src,
  name,
  size = 40,
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-medium text-brand-700 ring-1 ring-inset ring-brand-200',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? ''} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'clay' | 'warning' | 'danger';
  className?: string;
  label?: string;
}) {
  const pct = max === 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  const bar = { brand: 'bg-brand-600', clay: 'bg-clay-500', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-pill bg-bone-300', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className={cn('h-full rounded-pill transition-[width] duration-500 ease-editorial', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  icon,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  const tones = {
    info: 'bg-info-bg text-info-fg ring-info/20',
    success: 'bg-success-bg text-success-fg ring-success/20',
    warning: 'bg-warning-bg text-warning-fg ring-warning/20',
    danger: 'bg-danger-bg text-danger-fg ring-danger/20',
  }[tone];

  return (
    <div className={cn('flex gap-3 rounded-md px-4 py-3 text-sm ring-1 ring-inset', tones, className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
}

'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from './cn';

const button = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium tracking-tight transition-all duration-200 ease-editorial',
    'outline-none focus-visible:shadow-focus',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-bone-50 shadow-sm hover:bg-brand-700 active:bg-brand-800',
        secondary:
          'bg-bone-200 text-ink-800 ring-1 ring-inset ring-bone-300 hover:bg-bone-300 active:bg-bone-400',
        outline:
          'bg-transparent text-ink-800 ring-1 ring-inset ring-ink-300 hover:bg-bone-200 hover:ring-ink-400',
        ghost: 'bg-transparent text-ink-700 hover:bg-bone-200 hover:text-ink-900',
        clay: 'bg-clay-500 text-bone-50 shadow-sm hover:bg-clay-600 active:bg-clay-700',
        danger: 'bg-danger text-bone-50 shadow-sm hover:brightness-95 active:brightness-90',
        link: 'bg-transparent p-0 text-brand-600 underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-7 rounded-sm px-2 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5',
        sm: 'h-9 rounded-md px-3 text-sm [&_svg]:h-4 [&_svg]:w-4',
        md: 'h-11 rounded-md px-4 text-base [&_svg]:h-4 [&_svg]:w-4',
        lg: 'h-12 rounded-lg px-6 text-md [&_svg]:h-5 [&_svg]:w-5',
        /** Breeder surface: 3am, one hand, wet fingers. */
        tap: 'h-tap min-w-tap rounded-lg px-5 text-md [&_svg]:h-5 [&_svg]:w-5',
        icon: 'h-10 w-10 rounded-md [&_svg]:h-4 [&_svg]:w-4',
        'icon-tap': 'h-tap w-tap rounded-lg [&_svg]:h-5 [&_svg]:w-5',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(button({ variant, size, block }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { button as buttonVariants };

'use client';

import {
  CalendarHeart,
  Dog,
  FileSignature,
  GitBranch,
  Globe,
  Heart,
  Home,
  Inbox,
  Menu,
  PawPrint,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { Avatar, Badge, cn } from '@stud/ui';
import { api } from '@/lib/api';
import { Logo } from './logo';

/**
 * The breeder shell. Two modes from one tree:
 *   · mobile  — bottom tab bar, everything one thumb away
 *   · desktop — persistent rail that densifies into a real dashboard
 *
 * Breedera's discipline ("calming the chaos"), without BreederCloudPro's
 * wall of fields.
 */

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number };

const PRIMARY: NavItem[] = [
  { href: '/studio', label: 'Dashboard', icon: Home },
  { href: '/studio/dogs', label: 'Dogs', icon: Dog },
  { href: '/studio/breedings', label: 'Breedings', icon: CalendarHeart },
  { href: '/studio/litters', label: 'Litters', icon: PawPrint },
  { href: '/studio/buyers', label: 'Buyers', icon: Users },
  { href: '/studio/placed', label: 'Dogs You Bred', icon: Heart },
];

const SECONDARY: NavItem[] = [
  { href: '/studio/pedigrees', label: 'Pedigrees', icon: GitBranch },
  { href: '/studio/verification', label: 'Verification', icon: ShieldCheck },
  { href: '/studio/studs', label: 'Stud Directory', icon: Search },
  { href: '/studio/contracts', label: 'Contracts', icon: FileSignature },
  { href: '/studio/inbox', label: 'Inbox', icon: Inbox },
];

/** Mobile bottom bar carries only what gets used at 3am with one hand. */
const MOBILE_TABS: NavItem[] = [
  { href: '/studio', label: 'Home', icon: Home },
  { href: '/studio/litters', label: 'Litters', icon: PawPrint },
  { href: '/studio/dogs', label: 'Dogs', icon: Dog },
  { href: '/studio/buyers', label: 'Buyers', icon: Users },
  { href: '/studio/inbox', label: 'Inbox', icon: Inbox },
];

export function StudioShell({
  children,
  kennelName = 'Your kennel',
  userName,
  userAvatar,
}: {
  children: React.ReactNode;
  kennelName?: string;
  userName?: string | null;
  userAvatar?: string | null;
}) {
  const pathname = usePathname();
  const [railOpen, setRailOpen] = React.useState(false);

  const isActive = (href: string) =>
    href === '/studio' ? pathname === '/studio' : pathname.startsWith(href);

  /**
   * The signed-in breeder's kennel slug, for the "My Public Profile" link.
   * Fetched here rather than passed down, so every page gets it for free and
   * the link degrades to the homepage while loading or when there is none.
   */
  const [kennelSlug, setKennelSlug] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    api<{ kennels: { slug: string }[] }>('/kennels/mine')
      .then((d) => {
        if (!cancelled) setKennelSlug(d.kennels[0]?.slug ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const publicProfileUrl = kennelSlug ? `/breeders/${kennelSlug}` : '/';

  return (
    <div className="flex min-h-dvh">
      {/* ── Desktop rail ─────────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-bone-300 bg-bone-50 lg:flex">
        <div className="flex h-16 items-center border-b border-bone-200 px-5">
          <Link href="/studio">
            <Logo />
          </Link>
          <Badge tone="brand" size="sm" className="ml-2">
            Studio
          </Badge>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          <NavGroup items={PRIMARY} isActive={isActive} />
          <NavGroup label="Tools" items={SECONDARY} isActive={isActive} />
        </nav>

        <div className="border-t border-bone-200 p-3">
          {/* The way back out — straight to what buyers see of you. */}
          <Link
            href={publicProfileUrl}
            className="mb-1 flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-bone-200 hover:text-ink-900"
          >
            <Globe className="h-4 w-4 shrink-0 text-ink-400" />
            {kennelSlug ? 'My Public Profile' : 'Back to Main Site'}
          </Link>
          {/* Who you are signed in as. No settings page to link to yet. */}
          <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
            <Avatar src={userAvatar} name={userName ?? kennelName} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-800">{kennelName}</span>
              {userName && <span className="block truncate text-xs text-ink-400">{userName}</span>}
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main column ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-bone-300 bg-bone-100/95 px-4 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            className="rounded-md p-2 text-ink-700 hover:bg-bone-200"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/studio" className="flex-1">
            <Logo />
          </Link>
          <Avatar src={userAvatar} name={userName ?? kennelName} size={30} />
        </header>

        <div className="flex-1 pb-20 lg:pb-0">{children}</div>

        {/* ── Mobile bottom tabs ─────────────────────────────────────── */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-bone-300 bg-bone-50/97 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          {MOBILE_TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'flex min-h-tap flex-col items-center justify-center gap-0.5 py-2 text-2xs font-medium transition-colors',
                isActive(t.href) ? 'text-brand-700' : 'text-ink-400',
              )}
            >
              <t.icon className="h-5 w-5" />
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* ── Mobile drawer (full nav) ───────────────────────────────── */}
      {railOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-ink-950/40 backdrop-blur-[2px]"
            onClick={() => setRailOpen(false)}
            aria-label="Close menu"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-fade-up flex-col bg-bone-50 shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-bone-200 px-4">
              <Logo />
              <button
                onClick={() => setRailOpen(false)}
                className="rounded-md p-2 text-ink-500 hover:bg-bone-200"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav
              className="flex-1 space-y-6 overflow-y-auto px-3 py-5"
              onClick={() => setRailOpen(false)}
            >
              <NavGroup items={PRIMARY} isActive={isActive} tap />
              <NavGroup label="Tools" items={SECONDARY} isActive={isActive} tap />
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}

function NavGroup({
  label,
  items,
  isActive,
  tap,
}: {
  label?: string;
  items: NavItem[];
  isActive: (href: string) => boolean;
  tap?: boolean;
}) {
  return (
    <div>
      {label && (
        <p className="px-3 pb-2 text-2xs font-semibold uppercase tracking-widest text-ink-400">
          {label}
        </p>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors',
                tap ? 'min-h-tap' : 'py-2',
                isActive(item.href)
                  ? 'bg-brand-100 text-brand-800'
                  : 'text-ink-600 hover:bg-bone-200 hover:text-ink-900',
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <Badge tone="clay" size="sm">
                  {item.badge}
                </Badge>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Standard page frame inside the shell. Keeps gutters consistent. */
export function StudioPage({
  title,
  description,
  actions,
  children,
  wide,
  avatar,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  /** A photo beside the title — a dog's face makes a page theirs. */
  avatar?: string | null;
}) {
  return (
    <div className={cn('mx-auto px-4 py-6 lg:px-8 lg:py-8', wide ? 'max-w-wide' : 'max-w-content')}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          {avatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-sm ring-1 ring-black/5"
            />
          )}
          <div>
            <h1 className="font-display text-2xl leading-tight tracking-tight text-ink-900">{title}</h1>
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

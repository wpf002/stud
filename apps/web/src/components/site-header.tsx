'use client';

import { Menu, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { Button, cn } from '@stud/ui';
import { api } from '@/lib/api';
import { Logo } from './logo';

const NAV = [
  { href: '/puppies', label: 'Puppies' },
  { href: '/studs', label: 'Stud Dogs' },
  { href: '/breeders', label: 'Breeders' },
  { href: '/verification', label: 'How Verification Works' },
  { href: '/learn', label: 'Learn' },
];

interface SessionUser {
  id: string;
  name: string | null;
  displayName: string | null;
  email: string;
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  /**
   * Who is signed in, if anyone.
   *
   * The header used to be blind to the session — you could sign in
   * successfully and it would still say "Sign In", which reads as a silent
   * failure. Re-fetched on every route change so logging in updates it.
   */
  const [user, setUser] = React.useState<SessionUser | null | undefined>(undefined);
  React.useEffect(() => {
    let cancelled = false;
    api<{ user: SessionUser | null }>('/auth/me')
      .then((d) => {
        if (!cancelled) setUser(d.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // Signing out of a dead session is still signed out.
    }
    setUser(null);
    router.push('/');
    router.refresh();
  }

  const firstName = user ? (user.name ?? user.displayName ?? user.email).split(' ')[0] : null;

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300 ease-editorial',
        scrolled
          ? 'border-b border-bone-300 bg-bone-100/90 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-content items-center gap-6 px-5 lg:px-8">
        <Link href="/" aria-label="Stud home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith(item.href)
                  ? 'text-ink-900'
                  : 'text-ink-500 hover:bg-bone-200 hover:text-ink-900',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/studio">For Breeders</Link>
          </Button>
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/my/applications">My Applications</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/my/dogs">My Dogs</Link>
              </Button>
              <span className="hidden items-center gap-1.5 pl-1 text-sm text-ink-500 xl:flex">
                <UserRound className="h-4 w-4 text-ink-400" /> {firstName}
              </span>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Create Account</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="ml-auto rounded-md p-2 text-ink-700 hover:bg-bone-200 lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="animate-fade-up border-t border-bone-300 bg-bone-100 lg:hidden">
          <nav className="mx-auto max-w-content space-y-1 px-5 py-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2.5 text-md font-medium text-ink-700 hover:bg-bone-200"
              >
                {item.label}
              </Link>
            ))}
            {user ? (
              <div className="space-y-1 pt-3">
                <Link
                  href="/my/dogs"
                  className="block rounded-md px-3 py-2.5 text-md font-medium text-ink-700 hover:bg-bone-200"
                >
                  My Dogs
                </Link>
                <Link
                  href="/my/applications"
                  className="block rounded-md px-3 py-2.5 text-md font-medium text-ink-700 hover:bg-bone-200"
                >
                  My Applications
                </Link>
                <Button variant="outline" block size="sm" onClick={signOut}>
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 pt-3">
                <Button asChild variant="outline" block size="sm">
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button asChild block size="sm">
                  <Link href="/signup">Create Account</Link>
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

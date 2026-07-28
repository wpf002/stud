'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Alert, Button, Checkbox, Field, Input } from '@stud/ui';
import { api, ApiError } from '@/lib/api';

type Role = 'BUYER' | 'BREEDER' | 'OWNER';

const ROLE_COPY: { value: Role; label: string; hint: string }[] = [
  { value: 'BUYER', label: 'I’m looking for a puppy', hint: 'Search litters, apply, reserve.' },
  { value: 'BREEDER', label: 'I breed dogs', hint: 'Litters, whelping, buyer pipeline.' },
  { value: 'OWNER', label: 'I own a dog I may offer at stud', hint: 'Stud profile and inquiries.' },
];

export function AuthForm({
  mode,
  className,
  redirectTo = '/',
}: {
  mode: 'login' | 'signup';
  className?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [roles, setRoles] = React.useState<Role[]>(['BUYER']);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(e.currentTarget);

    try {
      if (mode === 'signup') {
        await api('/auth/signup', {
          method: 'POST',
          json: {
            email: String(data.get('email')),
            password: String(data.get('password')),
            name: String(data.get('name') || '') || undefined,
            roles: roles.length ? roles : ['BUYER'],
          },
        });
      } else {
        await api('/auth/login', {
          method: 'POST',
          json: { email: String(data.get('email')), password: String(data.get('password')) },
        });
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  function toggleRole(role: Role, on: boolean) {
    setRoles((prev) => (on ? [...new Set([...prev, role])] : prev.filter((r) => r !== role)));
  }

  return (
    <form onSubmit={onSubmit} className={className} noValidate>
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {mode === 'signup' && (
          <Field label="Name" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" placeholder="Jordan Hale" />
          </Field>
        )}

        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          required
          hint={mode === 'signup' ? 'At least 10 characters.' : undefined}
        >
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={mode === 'signup' ? 10 : undefined}
          />
        </Field>

        {mode === 'signup' && (
          <fieldset className="space-y-2.5 rounded-md border border-bone-300 bg-bone-50 p-4">
            <legend className="px-1 text-sm font-medium text-ink-700">
              What brings you here? Pick any.
            </legend>
            {ROLE_COPY.map((r) => (
              <Checkbox
                key={r.value}
                checked={roles.includes(r.value)}
                onChange={(e) => toggleRole(r.value, e.target.checked)}
                label={
                  <span>
                    <span className="font-medium text-ink-800">{r.label}</span>
                    <span className="block text-xs text-ink-400">{r.hint}</span>
                  </span>
                }
              />
            ))}
          </fieldset>
        )}

        <Button type="submit" size="lg" block loading={pending}>
          {mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>
      </div>
    </form>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-5 py-20">
      <h1 className="font-display text-3xl leading-tight tracking-tight text-ink-900">Welcome back</h1>
      <p className="mt-2 text-ink-500">Sign in to continue.</p>
      <AuthForm mode="login" className="mt-8" />
      <p className="mt-6 text-sm text-ink-500">
        No account yet?{' '}
        <Link href="/signup" className="font-medium text-brand-700 underline underline-offset-4">
          Create one
        </Link>
      </p>
    </div>
  );
}

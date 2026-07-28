import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Create account' };

export default function SignupPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-5 py-20">
      <h1 className="font-display text-3xl leading-tight tracking-tight text-ink-900">
        Create your account
      </h1>
      <p className="mt-2 text-ink-500">
        One account covers all three sides — buying, breeding, and offering a stud.
      </p>
      <AuthForm mode="signup" className="mt-8" />
      <p className="mt-6 text-sm text-ink-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-700 underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}

import { ArrowRight, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Button, VerificationBadge, VerificationEvidencePanel, type VerificationState } from '@stud/ui';

export const metadata: Metadata = {
  title: 'How Verification Works',
  description:
    'Every health result on Stud is checked with the registry that issued it. Here’s how that works, in plain terms.',
  alternates: { canonical: '/verification' },
};

/**
 * The verification explainer.
 *
 * Structured like a page a company would publish, not a spec: the idea, one
 * real example, a compact badge legend, and an FAQ. The full reference detail
 * lives in the product itself, on every claim.
 */
const BADGE_LEGEND: { state: VerificationState; line: string }[] = [
  { state: 'VERIFIED', line: 'We matched this result at the registry.' },
  { state: 'REPORTED', line: 'The owner entered this. We haven’t confirmed it yet.' },
  { state: 'PENDING', line: 'We’re checking it right now.' },
  { state: 'STALE', line: 'Due for a re-check — it’s been a while since the last one.' },
  { state: 'CONFLICTED', line: 'The registry now shows something different. Our team is on it.' },
  { state: 'UNVERIFIED', line: 'No result submitted for this test.' },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What if a test is missing?',
    a: 'We say so. Each breed has a set of recommended tests, and a dog’s profile lists any that haven’t been done — labeled “not tested.” You can ask the breeder about them before you apply.',
  },
  {
    q: 'What does “Reported” mean?',
    a: 'The owner told us the result but we couldn’t confirm it with a registry — usually because that registry doesn’t offer online lookups. Reported results are always labeled and never counted as verified.',
  },
  {
    q: 'How often do you re-check?',
    a: 'Most sources every 30 days, field and hunt-test records every 60. If a registry changes what it shows for a dog, the result gets flagged for review and drops out of search filters until it’s resolved.',
  },
  {
    q: 'Which registries do you check?',
    a: 'OFA and CHIC for orthopedic, eye, and cardiac results; AKC, UKC, CKC, and FCI for registrations and titles; NAVHDA and AFTCA for field work; Embark, Wisdom Panel, UC Davis, and Paw Print for DNA panels.',
  },
  {
    q: 'Can a breeder pay for a better badge or a higher ranking?',
    a: 'No. Verification is free for every breeder, search ranking reads verified results and nothing else, and there are no ads or sponsored placements.',
  },
  {
    q: 'Does “verified” mean the dog is healthy?',
    a: 'It means the test happened and this is what it said. Reading the results — and deciding whether a pairing makes sense — is still a conversation to have with the breeder. The COI and pedigree tools can help.',
  },
];

export default function VerificationPage() {
  return (
    <div className="mx-auto max-w-content px-5 py-16 lg:px-8 lg:py-20">
      {/* ── The idea ─────────────────────────────────────────────────── */}
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
            How Verification Works
          </p>
          <h1 className="mt-3 max-w-xl font-display text-4xl leading-[1.08] tracking-tight text-ink-900">
            We check every health claim with the registry that issued it.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
            Breeders enter their dogs with registration numbers. We pull the actual records from
            OFA, the kennel clubs, and the testing labs — and keep re-checking them. What you see
            on a listing came from the source, not from a form.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/puppies">
                See It on Real Litters <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>

        {/* One real example, not six. */}
        <div className="mx-auto w-full max-w-sm">
          <div className="rounded-card bg-bone-50 p-5 shadow-lg ring-1 ring-black/5">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-full">
                <Image
                  src="https://images.unsplash.com/photo-1477884213360-7e9d7dcc1e48?q=80&w=200&auto=format&fit=crop"
                  alt=""
                  fill
                  className="object-cover"
                  sizes="3rem"
                />
              </div>
              <div>
                <p className="font-display text-lg text-ink-900">Ranger</p>
                <p className="text-2xs text-ink-400">German Shorthaired Pointer</p>
              </div>
            </div>
            <div className="mt-4">
              <VerificationEvidencePanel
                state="VERIFIED"
                claim="Hips"
                evidence={{
                  source: 'OFA',
                  sourceUrl: 'https://ofa.org',
                  result: 'Excellent',
                  identifier: 'SR91234501',
                  testedAt: '2023-04-18',
                  checkedAt: '2026-07-21',
                }}
              />
            </div>
            <p className="mt-3 border-t border-bone-200 pt-2 text-2xs text-ink-400">
              A real result card, exactly as it appears on a listing.
            </p>
          </div>
        </div>
      </div>

      {/* ── The badges ───────────────────────────────────────────────── */}
      <section className="mt-20 max-w-3xl">
        <h2 className="font-display text-2xl tracking-tight text-ink-900">The Badges</h2>
        <p className="mt-2 text-md leading-relaxed text-ink-600">
          Every result carries one of these, so you always know how much weight to give it.
        </p>
        <ul className="mt-6 divide-y divide-bone-200">
          {BADGE_LEGEND.map(({ state, line }) => (
            <li key={state} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5">
              <span className="w-40 shrink-0">
                <VerificationBadge state={state} />
              </span>
              <span className="text-sm leading-relaxed text-ink-600">{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className="mt-20 max-w-3xl">
        <h2 className="font-display text-2xl tracking-tight text-ink-900">Common Questions</h2>
        <div className="mt-6 space-y-8">
          {FAQ.map(({ q, a }) => (
            <div key={q}>
              <h3 className="font-display text-lg text-ink-900">{q}</h3>
              <p className="mt-2 text-md leading-relaxed text-ink-600">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="mt-20">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-brand-50 px-6 py-5 ring-1 ring-inset ring-brand-100">
          <p className="flex items-center gap-3 text-md text-ink-700">
            <ShieldCheck className="h-5 w-5 shrink-0 text-brand-600" />
            Every litter on Stud shows this for both parents.
          </p>
          <Button asChild>
            <Link href="/puppies">
              Find a Puppy <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

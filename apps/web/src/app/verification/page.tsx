import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button, Card, VerificationEvidencePanel, type VerificationState } from '@stud/ui';

export const metadata: Metadata = {
  title: 'How verification works',
  description:
    'What “verified” means on Stud: which sources we check, how often we re-check, and what every badge state actually tells you.',
};

const STATES: { state: VerificationState; when: string }[] = [
  { state: 'VERIFIED', when: 'A source confirmed the claim and we recorded where and when.' },
  { state: 'REPORTED', when: 'The owner entered it. No source confirms it yet.' },
  { state: 'PENDING', when: 'A lookup is in flight right now.' },
  { state: 'STALE', when: 'The last successful check is older than our freshness window.' },
  { state: 'CONFLICTED', when: 'The source changed and no longer agrees with what we held.' },
  { state: 'UNVERIFIED', when: 'Nothing has been submitted for this claim at all.' },
];

const SOURCES = [
  {
    name: 'OFA / CHIC',
    covers: 'Hips, elbows, eyes (CAER), cardiac, patella, thyroid, breed-specific panels',
    key: 'Registration number',
    cadence: 'Every 30 days',
  },
  {
    name: 'AKC · UKC · CKC · FCI',
    covers: 'Registration validity, registered name, conformation and performance titles',
    key: 'Registration number',
    cadence: 'Every 30 days',
  },
  {
    name: 'NAVHDA · AFTCA · hunt tests',
    covers: 'Natural Ability, Utility, field trial placements, hunt test legs',
    key: 'Registration number or dog name + owner',
    cadence: 'Every 60 days',
  },
  {
    name: 'Embark · Wisdom · UC Davis · Paw Print',
    covers: 'Genetic panels, carrier and at-risk status, genetic COI',
    key: 'Uploaded certificate, OCR pre-filled, human-reviewed',
    cadence: 'On upload, then on request',
  },
];

export default function VerificationPage() {
  return (
    <div className="mx-auto max-w-content px-5 py-16 lg:px-8 lg:py-24">
      <div className="max-w-2xl">
        <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
          How Verification Works
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.1] tracking-tight text-ink-900">
          Anyone can say &ldquo;health tested.&rdquo;
          <br />
          We go check.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-600">
          Every health result on Stud is looked up at the registry that issued it. Here&rsquo;s
          exactly how — and what every badge means when you see one.
        </p>
      </div>

      {/* The whole idea, in three steps. */}
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ['The breeder adds their dog', 'Name and registration number — the same ones on the paperwork.'],
          ['We look the results up', 'Straight from OFA, the kennel clubs and the testing labs. On a schedule, not once.'],
          ['You see the receipt', 'The result, the source, and the date we checked. Or "not tested" — we show that too.'],
        ].map(([title, body], i) => (
          <div key={title} className="rounded-card bg-bone-50 p-5 ring-1 ring-inset ring-bone-300">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-clay-100 font-display text-md font-semibold text-clay-600">
              {i + 1}
            </span>
            <p className="mt-3 font-display text-lg text-ink-900">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">{body}</p>
          </div>
        ))}
      </div>

      {/* Sources */}
      <section className="mt-16">
        <h2 className="font-display text-2xl tracking-tight text-ink-900">Where We Check</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-bone-400 text-left text-2xs uppercase tracking-widest text-ink-400">
                <th className="py-3 pr-4 font-semibold">Source</th>
                <th className="py-3 pr-4 font-semibold">What it covers</th>
                <th className="py-3 pr-4 font-semibold">Matched on</th>
                <th className="py-3 font-semibold">Re-checked</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.name} className="border-b border-bone-200 align-top">
                  <td className="py-4 pr-4 font-medium text-ink-900">{s.name}</td>
                  <td className="py-4 pr-4 text-ink-600">{s.covers}</td>
                  <td className="py-4 pr-4 font-mono text-xs text-ink-500">{s.key}</td>
                  <td className="py-4 text-ink-600">{s.cadence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* States */}
      <section className="mt-16">
        <h2 className="font-display text-2xl tracking-tight text-ink-900">What Every Badge Means</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-ink-600">
          A result isn&rsquo;t a one-time checkbox — it moves through these states over its life,
          and you always see which one you&rsquo;re looking at.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STATES.map(({ state, when }) => (
            <Card key={state} className="p-5">
              <VerificationEvidencePanel
                state={state}
                claim="Example: Hips"
                evidence={
                  state === 'VERIFIED' || state === 'STALE' || state === 'CONFLICTED'
                    ? {
                        source: 'OFA',
                        sourceUrl: 'https://ofa.org',
                        result: 'Excellent',
                        identifier: 'SR91234501',
                        testedAt: '2023-04-18',
                        checkedAt: state === 'STALE' ? '2025-11-02' : '2026-07-21',
                        conflictNote:
                          state === 'CONFLICTED'
                            ? 'OFA now returns “Fair” for this registration. Previously recorded as “Good”. Under admin review.'
                            : null,
                      }
                    : null
                }
              />
              <p className="mt-4 border-t border-bone-200 pt-3 text-xs leading-relaxed text-ink-500">
                <span className="font-semibold text-ink-700">You see this when: </span>
                {when}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Commitments */}
      <section className="mt-16 grid gap-6 lg:grid-cols-2">
        <Card className="p-7">
          <h2 className="font-display text-xl text-ink-900">What We&rsquo;ll Never Do</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-600">
            <li>
              <span className="font-medium text-ink-800">Merge reported and verified data.</span>{' '}
              They live in separate columns and render differently. Always.
            </li>
            <li>
              <span className="font-medium text-ink-800">Hide an absent result.</span> &ldquo;Not
              verified&rdquo; renders as a visible state. A blank space is not a passing grade.
            </li>
            <li>
              <span className="font-medium text-ink-800">Charge for verification.</span> The moment
              it sits behind a paywall it stops being a trust signal.
            </li>
            <li>
              <span className="font-medium text-ink-800">Run third-party ads on buyer pages.</span>{' '}
              Nothing on a litter page is there because someone paid for it to be.
            </li>
          </ul>
        </Card>

        <Card className="p-7">
          <h2 className="font-display text-xl text-ink-900">Where This Stops</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-600">
            <li>
              We reproduce what the source says. If OFA has a data-entry error, we will faithfully
              show that error — and flag it the moment the source changes.
            </li>
            <li>
              Not every registry publishes machine-readable records. Where a source is closed, the
              claim stays <span className="font-medium">Reported</span> until a document is reviewed.
            </li>
            <li>
              Verification says a test was done and what it returned. It does not say a dog is a good
              breeding decision. That is what the pedigree and COI tools are for.
            </li>
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-6">
            <Link href="/tools/coi">
              Try the COI Calculator <ArrowRight />
            </Link>
          </Button>
        </Card>
      </section>
    </div>
  );
}

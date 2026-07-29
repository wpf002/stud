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
  { state: 'VERIFIED', when: 'We matched this result at the registry.' },
  { state: 'REPORTED', when: 'The owner entered this and we haven\u2019t been able to confirm it yet.' },
  { state: 'PENDING', when: 'We\u2019re checking this one right now.' },
  { state: 'STALE', when: 'It\u2019s been a while since our last check, so we\u2019re re-running it.' },
  { state: 'CONFLICTED', when: 'The registry now shows something different. We\u2019re reviewing it.' },
  { state: 'UNVERIFIED', when: 'No result has been submitted for this test.' },
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
          We check every health claim with the registry that issued it.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-600">
          When a breeder lists a test result on Stud, we pull the actual record from OFA, the
          kennel club, or the testing lab. This page explains how that works and what the badges
          mean.
        </p>
      </div>

      {/* The whole idea, in three steps. */}
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ['Breeders add their dogs', 'Each dog is entered with its registered name and registration number.'],
          ['We pull the records', 'Our system queries the registries on a regular schedule and matches results by registration number.'],
          ['Results appear with their source', 'Every result shows where it came from and when we last checked. Untested categories are labeled too.'],
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
        <h2 className="font-display text-2xl tracking-tight text-ink-900">Our Data Sources</h2>
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
          Results get re-checked over time, so each one carries a status. Here are all six, with
          examples of how they appear on a dog&rsquo;s profile.
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
                {when}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Commitments */}
      <section className="mt-16 grid gap-6 lg:grid-cols-2">
        <Card className="p-7">
          <h2 className="font-display text-xl text-ink-900">Our Commitments</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-600">
            <li>
              <span className="font-medium text-ink-800">Owner-entered results stay labeled.</span>{' '}
              We never mix them in with registry-confirmed ones.
            </li>
            <li>
              <span className="font-medium text-ink-800">Missing tests are shown.</span> If a dog
              hasn&rsquo;t been tested for something common in its breed, the profile says so.
            </li>
            <li>
              <span className="font-medium text-ink-800">Verification is free.</span> It&rsquo;s
              included for every breeder, and that&rsquo;s not going to change.
            </li>
            <li>
              <span className="font-medium text-ink-800">No ads on listings.</span> Placement on
              Stud can&rsquo;t be bought.
            </li>
          </ul>
        </Card>

        <Card className="p-7">
          <h2 className="font-display text-xl text-ink-900">Good to Know</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-ink-600">
            <li>
              We show what the registry shows. If the registry has an error in its records,
              you&rsquo;ll see that same error here until they correct it.
            </li>
            <li>
              Some registries don&rsquo;t offer online lookups. Results from those stay marked{' '}
              <span className="font-medium">Reported</span> until our team reviews the paperwork.
            </li>
            <li>
              Verification confirms that a test happened and what the result was. For questions
              about whether a particular pairing makes sense, check out the pedigree and COI tools.
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

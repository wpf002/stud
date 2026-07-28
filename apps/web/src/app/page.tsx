import {
  ArrowRight,
  BadgeCheck,
  FileSearch,
  GitBranch,
  HeartHandshake,
  MapPin,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, VerificationBadge } from '@stud/ui';

export default function HomePage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <TheDifference />
      <ThreeAudiences />
      <RecordTimeline />
      <ClosingCta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Warm ground with a soft brand wash behind the type. */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(80rem_40rem_at_50%_-10rem,theme(colors.brand.100),transparent_70%)]" />

      <div className="mx-auto max-w-content px-5 pb-20 pt-16 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-fade-up">
            <Badge tone="brand" size="lg" className="mb-6">
              <ShieldCheck /> Every claim checked against the source
            </Badge>

            <h1 className="max-w-2xl font-display text-4xl leading-[1.05] tracking-tight text-ink-900 lg:text-5xl">
              The health testing is either{' '}
              <span className="text-brand-700">verified</span>, or it doesn&rsquo;t say verified.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-600">
              Everywhere else, a breeder types their own OFA results into a form and the site prints
              them as fact. We look them up. Hips, elbows, eyes, cardiac, titles, field results —
              matched by registration number, stamped with the source and the date we checked.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/puppies">
                  Find a puppy <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/studs">Browse stud dogs</Link>
              </Button>
            </div>

            <p className="mt-6 text-sm text-ink-400">
              Breeder?{' '}
              <a
                href={process.env.NEXT_PUBLIC_STUDIO_URL ?? 'http://localhost:3001'}
                className="font-medium text-brand-700 underline underline-offset-4"
              >
                The workspace is free to start
              </a>{' '}
              — heat tracking, whelping, growth charts, pedigrees.
            </p>
          </div>

          <HeroCard />
        </div>
      </div>
    </section>
  );
}

/**
 * The hero visual is a stud profile fragment, not a stock photo of a puppy.
 * The product's argument is the receipts — so lead with the receipts.
 */
function HeroCard() {
  return (
    <Card className="animate-fade-up shadow-lg [animation-delay:120ms]">
      <div className="relative h-52 bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900">
        <div className="absolute inset-0 opacity-[0.15] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:14px_14px]" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <p className="text-2xs uppercase tracking-widest text-brand-200">
            German Shorthaired Pointer · 4 yr · Sire
          </p>
          <p className="mt-1 font-display text-2xl leading-tight text-bone-50">
            Blackwater&rsquo;s Ranger Of The Marsh
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-brand-100">
            <MapPin className="h-3.5 w-3.5" /> Denton, TX · ships chilled &amp; frozen
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
            Health — verified against OFA
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <VerificationBadge
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
            <VerificationBadge
              state="VERIFIED"
              claim="Elbows"
              evidence={{
                source: 'OFA',
                result: 'Normal',
                identifier: 'SR91234501',
                testedAt: '2023-04-18',
                checkedAt: '2026-07-21',
              }}
            />
            <VerificationBadge
              state="VERIFIED"
              claim="Cardiac"
              evidence={{
                source: 'OFA',
                result: 'Normal — Advanced',
                testedAt: '2023-09-02',
                checkedAt: '2026-07-21',
              }}
            />
            <VerificationBadge state="UNVERIFIED" claim="Thyroid" />
          </div>
        </div>

        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
            Titles &amp; field record
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <VerificationBadge
              state="VERIFIED"
              claim="Master Hunter"
              evidence={{
                source: 'AKC',
                result: 'MH',
                testedAt: '2024-10-12',
                checkedAt: '2026-07-21',
              }}
            />
            <VerificationBadge
              state="VERIFIED"
              claim="NAVHDA UT"
              evidence={{ source: 'NAVHDA', result: 'Prize I — 204', checkedAt: '2026-07-19' }}
            />
            <VerificationBadge state="REPORTED" claim="Blood tracking" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-bone-200 bg-bone-100 px-4 py-3">
          <div>
            <p className="text-2xs uppercase tracking-widest text-ink-400">Stud fee</p>
            <p className="font-display text-xl text-ink-900">$2,200</p>
          </div>
          <div className="text-right">
            <p className="text-2xs uppercase tracking-widest text-ink-400">Sire COI (5 gen)</p>
            <p className="font-mono text-xl tabular-nums text-brand-700">3.1%</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TrustStrip() {
  const sources = ['OFA / CHIC', 'AKC', 'UKC', 'NAVHDA', 'AFTCA', 'Embark', 'Wisdom Panel', 'UC Davis'];
  return (
    <section className="border-y border-bone-300 bg-bone-200/50 py-8">
      <div className="mx-auto max-w-content px-5 lg:px-8">
        <p className="text-center text-2xs font-semibold uppercase tracking-widest text-ink-400">
          Claims are checked against
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {sources.map((s) => (
            <span key={s} className="font-display text-md text-ink-500">
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function TheDifference() {
  const rows = [
    { claim: 'Health testing', them: 'Typed in by the seller', us: 'Looked up by registration number' },
    { claim: 'Titles', them: 'Listed in a bio paragraph', us: 'Matched to the awarding body' },
    { claim: 'Pedigree', them: 'A photo of a paper chart', us: 'A graph you can compute on' },
    { claim: 'Inbreeding', them: 'Not mentioned', us: "Wright's COI, before you breed" },
    { claim: 'Stud dogs', them: 'A classified ad board', us: 'A verified résumé and a track record' },
    { claim: 'After the sale', them: 'The record ends', us: 'It transfers to you' },
  ];

  return (
    <section className="mx-auto max-w-content px-5 py-20 lg:px-8 lg:py-28">
      <div className="max-w-2xl">
        <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
          Why this exists
        </p>
        <h2 className="mt-3 font-display text-3xl leading-tight tracking-tight text-ink-900">
          &ldquo;Health tested&rdquo; is doing a lot of work on most sites.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-ink-600">
          It usually means someone checked a box. The results are public — OFA publishes them, the
          registries publish titles, NAVHDA publishes scores. Nobody was reading them. We do, on a
          schedule, and we show you exactly what we found and when.
        </p>
      </div>

      <div className="mt-12 overflow-hidden rounded-card border border-bone-300 bg-bone-50">
        <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-bone-300 bg-bone-200/60 px-5 py-3 text-2xs font-semibold uppercase tracking-widest text-ink-400 sm:px-6">
          <span>Claim</span>
          <span>Elsewhere</span>
          <span className="text-brand-700">On Stud</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.claim}
            className="grid grid-cols-[1fr_1fr_1fr] items-start gap-3 border-b border-bone-200 px-5 py-4 text-sm last:border-0 sm:px-6"
          >
            <span className="font-medium text-ink-800">{r.claim}</span>
            <span className="text-ink-400">{r.them}</span>
            <span className="flex items-start gap-1.5 text-brand-700">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
              {r.us}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ThreeAudiences() {
  const cards = [
    {
      icon: HeartHandshake,
      eyebrow: 'For families',
      title: 'Buy a puppy and know what you bought',
      body: 'Search by breed, distance, price — and by whether the parents’ health testing actually checks out. Every litter page shows both parents’ verified panels, titles and COI.',
      href: '/puppies',
      cta: 'Browse puppies',
    },
    {
      icon: GitBranch,
      eyebrow: 'For breeders',
      title: 'Plan the breeding before you commit to it',
      body: 'Pick a dam and a prospective sire and get the projected litter COI, the shared ancestors, and any at-risk genetic pairings — for a litter that does not exist yet.',
      href: '/studs',
      cta: 'Open the stud directory',
    },
    {
      icon: Stethoscope,
      eyebrow: 'For stud owners',
      title: 'A résumé for your dog, not a classified ad',
      body: 'Verified panels, verified titles, real pedigree, and — over time — what he has actually produced, reported by the owners of his puppies.',
      href: '/studs/list-your-dog',
      cta: 'List your stud',
    },
  ];

  return (
    <section className="border-y border-bone-300 bg-bone-200/40 py-20 lg:py-28">
      <div className="mx-auto max-w-content px-5 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {cards.map((c) => (
            <Card key={c.title} interactive className="flex flex-col">
              <div className="flex-1 p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                  <c.icon className="h-5 w-5" />
                </span>
                <p className="mt-5 text-2xs font-semibold uppercase tracking-widest text-ink-400">
                  {c.eyebrow}
                </p>
                <h3 className="mt-2 font-display text-xl leading-tight text-ink-900">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{c.body}</p>
              </div>
              <div className="px-6 pb-6">
                <Button asChild variant="outline" size="sm">
                  <Link href={c.href}>
                    {c.cta} <ArrowRight />
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecordTimeline() {
  const steps = [
    {
      n: '01',
      title: 'The stud is verified',
      body: 'Registration numbers go in. OFA, the registry and the performance bodies come back with results, dates and sources.',
    },
    {
      n: '02',
      title: 'The pairing is modelled',
      body: 'Dam and sire pedigrees merge into one graph. You see the projected COI and every shared ancestor before a contract exists.',
    },
    {
      n: '03',
      title: 'The breeding is documented',
      body: 'Contract, signatures, stud fee, collection and AI paperwork, confirmed pregnancy — all on the same record.',
    },
    {
      n: '04',
      title: 'The litter inherits it',
      body: 'The litter listing composes itself from the breeding. Nobody re-types a single health result.',
    },
    {
      n: '05',
      title: 'The buyer is screened',
      body: 'Application, waitlist position, deposit, balance, pickup — tracked, with the money held safely in between.',
    },
    {
      n: '06',
      title: 'The record goes home',
      body: 'On pickup day the whole file transfers to the new owner. Later, what that dog becomes rolls back up to its sire and dam.',
    },
  ];

  return (
    <section className="mx-auto max-w-content px-5 py-20 lg:px-8 lg:py-28">
      <div className="max-w-2xl">
        <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
          One continuous record
        </p>
        <h2 className="mt-3 font-display text-3xl leading-tight tracking-tight text-ink-900">
          Most platforms hold one slice of this. We hold the whole thing.
        </h2>
      </div>

      <ol className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="border-t border-bone-400 pt-5">
            <p className="font-mono text-xs tabular-nums text-clay-500">{s.n}</p>
            <h3 className="mt-2 font-display text-lg leading-tight text-ink-900">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="mx-auto max-w-content px-5 pb-8 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl bg-brand-800 px-8 py-14 text-center lg:px-16 lg:py-20">
        <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:16px_16px]" />
        <div className="relative">
          <FileSearch className="mx-auto h-8 w-8 text-brand-200" />
          <h2 className="mx-auto mt-5 max-w-2xl font-display text-3xl leading-tight tracking-tight text-bone-50">
            Start with one dog. The tools are useful before the marketplace ever is.
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-brand-100">
            Import a pedigree, run a COI, verify a health panel. No listing required, no network
            effect required, no card required.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="clay">
              <a href={process.env.NEXT_PUBLIC_STUDIO_URL ?? 'http://localhost:3001'}>
                Open the breeder workspace <ArrowRight />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-brand-400 text-bone-50 ring-brand-400 hover:bg-brand-700"
            >
              <Link href="/verification">Read the verification standard</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

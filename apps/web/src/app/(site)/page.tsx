import { ArrowRight, FileSearch, Heart, ShieldCheck, Stethoscope } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@stud/ui';

/**
 * The homepage.
 *
 * The rule here: photos and short sentences. The receipts exist on every
 * litter page — the front door's job is to feel like the start of getting a
 * dog, not the start of an audit.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <WhyStrip />
      <BreederBand />
    </>
  );
}

const HERO_PHOTOS = {
  running: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=900&auto=format&fit=crop',
  beagle: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=900&auto=format&fit=crop',
  goldenPup: 'https://images.unsplash.com/photo-1591160690555-5debfba289f0?q=80&w=900&auto=format&fit=crop',
};

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70rem_36rem_at_70%_-6rem,theme(colors.clay.100),transparent_65%)]" />

      <div className="mx-auto max-w-content px-5 pb-16 pt-14 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="animate-fade-up">
            <h1 className="max-w-xl font-display text-5xl leading-[1.02] tracking-tight text-ink-900 lg:text-6xl">
              Your new best friend is{' '}
              <span className="relative inline-block text-clay-600">
                worth checking
                {/* hand-drawn underline */}
                <svg
                  viewBox="0 0 220 12"
                  className="absolute -bottom-2 left-0 w-full text-clay-400"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M4 8.5C60 3 140 2.5 216 6.5"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              .
            </h1>

            <p className="mt-7 max-w-md text-lg leading-relaxed text-ink-600">
              Puppies from breeders who health-test their dogs — and we check every result with the
              registry, so you don&rsquo;t have to take anyone&rsquo;s word for it.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/puppies">
                  Find a Puppy <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/breeders">Meet the Breeders</Link>
              </Button>
            </div>
          </div>

          {/* Tilted snapshots, like photos on a fridge. */}
          <div className="relative mx-auto h-[26rem] w-full max-w-md lg:max-w-none">
            <Polaroid
              src={HERO_PHOTOS.beagle}
              alt="A very happy beagle"
              className="absolute left-0 top-8 w-[58%] -rotate-3"
              caption="Milo, gone home"
            />
            <Polaroid
              src={HERO_PHOTOS.running}
              alt="Two dogs running down a path"
              className="absolute right-0 top-0 w-[52%] rotate-2"
              caption="zoomies included"
            />
            <Polaroid
              src={HERO_PHOTOS.goldenPup}
              alt="A golden retriever puppy"
              className="absolute bottom-0 right-10 w-[46%] rotate-[4deg]"
              caption="8 weeks old"
            />
            {/* a little doodle heart */}
            <Heart
              className="absolute bottom-24 left-8 h-8 w-8 rotate-[-12deg] fill-clay-400 text-clay-400"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Polaroid({
  src,
  alt,
  caption,
  className,
}: {
  src: string;
  alt: string;
  caption: string;
  className?: string;
}) {
  return (
    <figure
      className={`overflow-hidden rounded-xl bg-white p-2 pb-3 shadow-lg ring-1 ring-black/5 transition-transform duration-300 hover:rotate-0 ${className ?? ''}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
        <Image src={src} alt={alt} fill className="object-cover" sizes="26rem" />
      </div>
      <figcaption className="pt-2 text-center font-display text-sm text-ink-500">
        {caption}
      </figcaption>
    </figure>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <FileSearch className="h-5 w-5" />,
      color: 'bg-brand-100 text-brand-700',
      title: 'Browse Real Litters',
      body: 'Photos, prices, and both parents on every page.',
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      color: 'bg-clay-100 text-clay-600',
      title: 'See Checked Health Tests',
      body: 'Hips, eyes, heart, DNA — verified with the registry, not typed in.',
    },
    {
      icon: <Stethoscope className="h-5 w-5" />,
      color: 'bg-brand-100 text-brand-700',
      title: 'Apply, Then Pick Up',
      body: 'No payment until the breeder says yes. Contract and deposit handled here.',
    },
    {
      icon: <Heart className="h-5 w-5" />,
      color: 'bg-clay-100 text-clay-600',
      title: 'Bring Them Home',
      body: 'Their records come with them — pedigree, chip, vaccinations, the lot.',
    },
  ];

  return (
    <section className="mx-auto max-w-content px-5 pb-16 lg:px-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div key={s.title} className="rounded-card bg-bone-50 p-5 ring-1 ring-inset ring-bone-300">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${s.color}`}>
              {s.icon}
            </span>
            <p className="mt-3 font-display text-lg text-ink-900">{s.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhyStrip() {
  return (
    <section className="bg-brand-700">
      <div className="mx-auto max-w-content px-5 py-14 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl leading-tight text-bone-50 lg:text-4xl">
              &ldquo;Health tested&rdquo; is easy to say.
              <br />
              We make it easy to <span className="text-clay-300">prove</span>.
            </h2>
            <p className="mt-4 max-w-md text-md leading-relaxed text-brand-100">
              Anyone can type &ldquo;OFA Good&rdquo; into a listing. On Stud, that claim gets looked
              up at the source — and if a test is missing, the page says so instead of staying
              quiet.
            </p>
            <Button asChild variant="secondary" size="lg" className="mt-6">
              <Link href="/learn/how-verification-works">How the Checking Works</Link>
            </Button>
          </div>

          {/* One example receipt, not a wall of them. */}
          <div className="mx-auto w-full max-w-sm rounded-card bg-bone-50 p-5 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 overflow-hidden rounded-full">
                <Image
                  src={HERO_PHOTOS.goldenPup}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="3rem"
                />
              </div>
              <div>
                <p className="font-display text-lg text-ink-900">Marigold</p>
                <p className="text-2xs text-ink-400">Golden Retriever · mom</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {['Hips — OFA Good', 'Eyes — clear', 'Heart — normal'].map((label) => (
                <li key={label} className="flex items-center justify-between">
                  <span className="text-ink-700">{label}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-medium text-brand-700">
                    <ShieldCheck className="h-3 w-3" /> checked
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-bone-300 pt-2 text-2xs text-ink-400">
              Verified with the issuing registry · updated this week
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BreederBand() {
  return (
    <section className="mx-auto max-w-content px-5 py-16 lg:px-8">
      <div className="overflow-hidden rounded-card bg-clay-100 ring-1 ring-inset ring-clay-200">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_20rem]">
          <div className="p-8 lg:p-10">
            <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
              For Breeders
            </p>
            <h2 className="mt-2 font-display text-3xl leading-tight text-ink-900">
              Your program, with the paperwork on autopilot
            </h2>
            <p className="mt-3 max-w-lg text-md leading-relaxed text-ink-600">
              Heat tracking, whelping, growth charts, contracts and payments — and when a puppy
              goes home, its whole record goes with it. Free to start.
            </p>
            <Button asChild size="lg" className="mt-5">
              <Link href="/studio">
                Open the Workspace <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="relative hidden h-full min-h-[16rem] lg:block">
            <Image
              src={HERO_PHOTOS.running}
              alt="Dogs mid-zoomies"
              fill
              className="object-cover"
              sizes="20rem"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

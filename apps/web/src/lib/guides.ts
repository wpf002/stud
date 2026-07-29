/**
 * The guides.
 *
 * Written for a person on their phone at 11pm, not for a policy binder:
 * short paragraphs, checklists you can actually use, and every guide ends at
 * the product page that makes the advice actionable. Authored as code so a
 * guide gets reviewed like everything else.
 */

export interface Guide {
  slug: string;
  title: string;
  description: string;
  /** Reading time, minutes. Honest, from word count. */
  minutes: number;
  audience: 'BUYER' | 'BREEDER';
  updated: string;
  photo: string;
  body: GuideSection[];
}

export interface GuideSection {
  heading?: string;
  paragraphs?: string[];
  /** Rendered as a checklist. Guides earn their keep here. */
  list?: string[];
}

const U = (id: string) =>
  `https://images.unsplash.com/photo-${id}?q=80&w=1200&auto=format&fit=crop`;

export const GUIDES: Guide[] = [
  {
    slug: 'how-to-read-health-testing',
    title: 'How to Read Health Testing',
    description:
      'What OFA grades and DNA panels actually mean, what "vet checked" doesn\'t, and how to look any result up yourself.',
    minutes: 5,
    audience: 'BUYER',
    updated: '2026-07-28',
    photo: U('1633722715463-d30f4f325e24'),
    body: [
      {
        paragraphs: [
          'Every listing says the parents are healthy. Here\'s how to tell who can back it up.',
          'First, the big one: "vet checked" is not health testing. It means a vet looked at the dog. A hip score, an eye exam, and a DNA panel are specific tests with results you can look up. Plenty of good breeders mix up the terms — but you shouldn\'t.',
        ],
      },
      {
        heading: 'The tests that exist',
        list: [
          'Hips & elbows — X-rays graded by a registry like OFA. Grades run Excellent, Good, Fair, then the dysplastic ones. Final grades happen at age two or later.',
          'Eyes (CAER) — an annual exam by a veterinary ophthalmologist. It expires; a four-year-old exam describes a four-year-old dog.',
          'Heart — anything from a basic listen to an echocardiogram by a cardiologist. The report says which. In some breeds, the difference matters a lot.',
          'DNA panel — tests for specific inherited conditions. Each result is clear, carrier, or affected.',
        ],
      },
      {
        heading: 'A carrier is not a sick dog',
        paragraphs: [
          'A carrier bred to a clear dog produces zero affected puppies. Breeders who are open about carriers understand their genetics — that\'s a green flag, not a red one.',
        ],
      },
      {
        heading: 'How to check it yourself',
        list: [
          'Ask for both parents\' registration numbers. Hesitation here answers a bigger question.',
          'Look them up — OFA\'s database is public and free.',
          'Check the dates. A "prelim" hip score isn\'t a final. An old eye exam is old.',
          '"Champion bloodlines" with no titles on the actual parents means the titles belong to a great-grandparent.',
        ],
      },
      {
        paragraphs: [
          'On Stud, this lookup is already done. Every result on a listing is marked checked-at-the-source or owner-reported — and if a test is missing, the page says "not tested" instead of staying quiet.',
        ],
      },
    ],
  },
  {
    slug: 'questions-to-ask-a-breeder',
    title: 'Questions to Ask a Breeder',
    description:
      'Twelve questions good breeders love answering — and the answers that should send you elsewhere.',
    minutes: 4,
    audience: 'BUYER',
    updated: '2026-07-28',
    photo: U('1548199973-03cce0bbc87b'),
    body: [
      {
        paragraphs: [
          'A good breeder is interviewing you right back. None of these questions are traps — they\'re the ones responsible breeders answer happily, because the answers are their life\'s work.',
        ],
      },
      {
        heading: 'About the dogs',
        list: [
          'What health testing do both parents have — and can I see the results?',
          'Why this pairing? What does each parent bring?',
          'How related are the parents? (A breeder who knows the litter\'s COI has done homework most skip.)',
          'How many litters has mom had, and how far apart?',
          'Can I talk to someone who bought a puppy from you before?',
        ],
      },
      {
        heading: 'About the deal',
        list: [
          'What happens if I ever can\'t keep the dog? (Right answer: it comes back to you, any age, no questions.)',
          'What does the health guarantee actually pay — and do I have to give the dog back to claim it?',
          'What happens to my deposit if I change my mind? If you change yours?',
          'When is the balance due?',
        ],
      },
      {
        heading: 'Walk away if you hear…',
        list: [
          'Multiple litters always available, year-round.',
          'Prices that vary by color but not by anything that matters.',
          '"Papers cost extra." Registration is not an add-on.',
          'A deposit request before a single question about your home.',
          'No, you can\'t see where the dogs live.',
        ],
      },
      {
        paragraphs: [
          'On Stud, the contract terms — deposit, guarantee, take-back — are part of the record, so you\'re not relying on remembering who said what.',
        ],
      },
    ],
  },
  {
    slug: 'what-is-limited-registration',
    title: 'Limited Registration, Explained',
    description:
      'Why most pet puppies are sold on limited registration, and when it actually matters to you.',
    minutes: 3,
    audience: 'BUYER',
    updated: '2026-07-28',
    photo: U('1587300003388-59208cc962cb'),
    body: [
      {
        paragraphs: [
          'Limited registration means one thing: your dog is fully registered, but its puppies couldn\'t be. That\'s it.',
          'Your dog still has papers and a pedigree, can compete in most sports, and is every bit as much yours. Breeders sell pet puppies this way because preventing unplanned litters from untested dogs is the whole point of breeding carefully.',
          'It\'s not a grade on your puppy. Which puppies get full registration is usually decided on show structure at eight weeks — long after temperament has made most of them somebody\'s perfect pet.',
        ],
      },
      {
        heading: 'When it matters',
        list: [
          'You want to show in conformation → say so up front. Different conversation, often a different contract.',
          'You hope to breed someday → same. Expect real questions, maybe co-ownership.',
          'You want a great dog → limited registration changes nothing about your life together.',
        ],
      },
      {
        paragraphs: [
          'One caution: be wary of a breeder who hands out full registration without asking why you want it. Careless there usually means careless elsewhere.',
        ],
      },
    ],
  },
  {
    slug: 'understanding-coi',
    title: 'COI, in Plain English',
    description:
      'What the inbreeding number means, what counts as high, and the catch hiding under a low one.',
    minutes: 3,
    audience: 'BUYER',
    updated: '2026-07-28',
    photo: U('1477884213360-7e9d7dcc1e48'),
    body: [
      {
        paragraphs: [
          'COI — coefficient of inbreeding — is the chance your puppy inherited the same gene from the same ancestor through both parents. Lower is better.',
        ],
      },
      {
        heading: 'The scale',
        list: [
          '0–5% — typical for a well-planned litter.',
          '6.25% — first cousins.',
          '12.5% — half-siblings, or grandparent to grandchild.',
          '25% — full siblings or parent to offspring.',
        ],
      },
      {
        paragraphs: [
          'Higher COI is linked to smaller litters, shorter lives, and doubled-up recessives — the bad ones along with the good. It\'s a risk dial, not a verdict on any single puppy.',
        ],
      },
      {
        heading: 'The catch',
        paragraphs: [
          'COI is only as good as the pedigree behind it. A 2% figure over three known generations and a 2% over eight complete ones are very different claims — hidden shared ancestry doesn\'t show up in the math.',
          'That\'s why Stud shows pedigree completeness next to every COI, and prints a high one in red instead of hiding it. You have more right to that number than anyone.',
        ],
      },
    ],
  },
  {
    slug: 'bringing-a-puppy-home',
    title: 'The First 72 Hours',
    description:
      'The one contract deadline almost everyone misses, and what else week one should include.',
    minutes: 3,
    audience: 'BUYER',
    updated: '2026-07-28',
    photo: U('1591160690555-5debfba289f0'),
    body: [
      {
        paragraphs: [
          'Most good puppy contracts require a vet visit within days of pickup — 72 hours is common. It\'s the most time-critical line in the whole document, and the happy chaos of a new puppy is exactly how it gets missed.',
          'The window protects both sides: find a pre-existing problem inside it and you can usually return the puppy for a full refund. Miss it, and that protection lapses. Book the appointment before pickup day.',
        ],
      },
      {
        heading: 'Also in week one',
        list: [
          'Keep the breeder\'s food. Change it slowly, if at all.',
          'Register the microchip in your name, if the breeder hasn\'t.',
          'Put the vaccination card somewhere findable — your vet will ask for dates.',
          'Sleep. (Kidding. Mostly.)',
        ],
      },
      {
        paragraphs: [
          'Bought through Stud? Your dog\'s page shows the exact vet deadline from your contract, the chip number, and every record that came home with them.',
        ],
      },
    ],
  },
  {
    slug: 'how-verification-works',
    title: 'What "Verified" Means Here',
    description:
      'The exact rules behind the checkmark — what gets checked, what stays "reported", and why we show what\'s missing.',
    minutes: 3,
    audience: 'BUYER',
    updated: '2026-07-28',
    photo: U('1552053831-71594a27632d'),
    body: [
      {
        paragraphs: [
          'Verified means we fetched the result from the registry that issued it and it matched the dog. Not a photo of a certificate — the record itself, checked at the source, with the date we checked.',
        ],
      },
      {
        heading: 'The four states',
        list: [
          'Verified — checked against the source. The badge shows where and when.',
          'Reported — the owner told us; we couldn\'t check it. Kept visibly separate, always.',
          'Stale — verified a while ago, due a recheck.',
          'Conflicted — the source now disagrees with what we had. Shown, never hidden, and excluded from every count until a human resolves it.',
        ],
      },
      {
        heading: 'And the part nobody else does',
        paragraphs: [
          'We show what\'s missing. A dog with no hip result reads "not tested" right next to the tests that exist for its breed. Classified sites can\'t do that — they never knew what was supposed to be there.',
        ],
      },
    ],
  },
];

export const GUIDES_BY_SLUG = new Map(GUIDES.map((g) => [g.slug, g]));

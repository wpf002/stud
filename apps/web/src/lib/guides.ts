/**
 * The guides.
 *
 * This is the organic engine. The searches a first-time buyer types — "what
 * questions to ask a dog breeder", "what is a limited registration", "what
 * does OFA good mean" — are exactly the ones this platform can answer better
 * than anyone, because the product is the answer.
 *
 * Authored here as data rather than in a CMS: nine phases in, a CMS is a
 * dependency this repo does not need, and a guide is code-reviewed like
 * everything else. Every guide ends by pointing at the product surface that
 * makes its advice actionable.
 */

export interface Guide {
  slug: string;
  title: string;
  description: string;
  /** Reading time, minutes. Honest, from word count. */
  minutes: number;
  audience: 'BUYER' | 'BREEDER';
  updated: string;
  body: GuideSection[];
}

export interface GuideSection {
  heading?: string;
  paragraphs: string[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'how-to-read-health-testing',
    title: 'How to read a dog’s health testing — and how to check it',
    description:
      'What OFA grades, CAER exams and DNA panels actually mean, what "vet checked" does not mean, and how to verify any claim against the registry that issued it.',
    minutes: 7,
    audience: 'BUYER',
    updated: '2026-07-20',
    body: [
      {
        paragraphs: [
          'Every puppy listing says the parents are healthy. Almost none of them tell you what that means, and the phrase does a great deal of work it has not earned. "Vet checked" means a vet looked at the dog — it is not a hip score, not an eye exam, and not a DNA panel. A breeder who confuses the two is not necessarily dishonest; they may simply not know the difference. But you need to.',
        ],
      },
      {
        heading: 'The tests that exist',
        paragraphs: [
          'Orthopaedic screening — hips and elbows — is done by radiograph and graded by a registry such as OFA (Excellent, Good, Fair, Borderline, and the dysplastic grades) or by PennHIP as a laxity percentile. The grade belongs to a specific dog, on a specific date, under a registry number you can look up.',
          'Eye exams (CAER) are annual, performed by a veterinary ophthalmologist, and expire — an exam from four years ago tells you about the dog four years ago. Cardiac exams range from a basic auscultation to an echocardiogram by a cardiologist; the report says which it was, and the difference matters in breeds with hereditary heart disease.',
          'DNA panels test for specific recessive conditions. A dog is clear, a carrier, or affected, per condition. A carrier bred to a clear dog produces no affected puppies — carrier status is a breeding constraint, not a defect, and a breeder who is open about carriers is showing you they understand the genetics.',
        ],
      },
      {
        heading: 'What to actually check',
        paragraphs: [
          'Ask for the registered name or registration number of both parents, then look them up yourself at the registry — OFA’s database is public. If a breeder hesitates to give you a registration number, that is the answer to a more important question.',
          'Match the dates. A CAER exam should be recent. A hip grade issued before the dog was two years old is a preliminary, not a final. A "champion bloodline" with no titles on either actual parent is a statement about great-grandparents.',
          'On Stud, this checking is done for you and shown with its provenance: every result on a listing is marked verified against the issuing registry, reported by the owner, or absent. Absence is shown too — a missing hip result reads "not tested", because a buyer cannot ask about a gap they cannot see.',
        ],
      },
    ],
  },
  {
    slug: 'questions-to-ask-a-breeder',
    title: 'The questions a good breeder hopes you will ask',
    description:
      'Twelve questions that separate a breeding program from a supply chain — and the answers that should worry you.',
    minutes: 6,
    audience: 'BUYER',
    updated: '2026-07-20',
    body: [
      {
        paragraphs: [
          'A good breeder is interviewing you as hard as you are interviewing them. The questions below are not tricks; they are the ones responsible breeders answer easily and gladly, because the answers are the substance of their program. Discomfort with them is data.',
        ],
      },
      {
        heading: 'About the dogs',
        paragraphs: [
          'What health testing do both parents have, and can I see the results? (The answer should be registry results you can check, not "the vet says she’s healthy".) Why this particular pairing — what is each parent bringing? How closely related are the sire and dam? A breeder who can tell you the litter’s projected COI has done arithmetic most have not.',
          'How many litters does the dam have, and how far apart? What happened to the puppies from previous litters — and can I talk to an owner from one?',
        ],
      },
      {
        heading: 'About the terms',
        paragraphs: [
          'What does the contract say happens if I ever cannot keep the dog? The right answer is: it comes back to them, at any age, unconditionally. What does the health guarantee actually pay, and does it require returning the dog? A guarantee that only pays if you give the dog back is one that most families will never use, and both parties know it.',
          'What happens to my deposit if I change my mind — and if you change yours? Is the balance due before or at pickup? On Stud these terms are machine-read from the signed contract and shown to you as dated obligations, so nothing lives only in a PDF you filed away.',
        ],
      },
      {
        heading: 'The answers that should worry you',
        paragraphs: [
          'Multiple litters always available. Prices that vary with colour but not with anything that matters. A refusal to show where the dogs live. Papers "available for an extra fee" — registration is not an add-on. Pressure to send a deposit before you have been asked a single question about your home: a breeder who does not vet buyers is one who does not much care where the puppies go.',
        ],
      },
    ],
  },
  {
    slug: 'what-is-limited-registration',
    title: 'Limited registration is not an insult',
    description:
      'What full versus limited registration means, why pet homes are offered limited, and when it genuinely matters.',
    minutes: 4,
    audience: 'BUYER',
    updated: '2026-07-20',
    body: [
      {
        paragraphs: [
          'Limited registration means your dog is registered — pedigree, papers, the lot — but any puppies it produces cannot be registered. That is the entire difference. The dog can compete in most performance sports, is exactly as much your dog, and costs the registry the same to record.',
          'Breeders sell pet puppies on limited registration because breeding well is the hard thing their program exists to do, and an unplanned litter from an untested dog undoes it. It is not a judgement on the puppy: which puppies go on full registration is usually decided on structure at eight weeks, long after temperament has made most of them wonderful pets.',
          'When does it matter? If you genuinely intend to show in conformation or to breed, say so up front — that is a different conversation and often a different contract, sometimes with co-ownership attached. What you should not do is accept full registration casually from a breeder who hands it out without asking why you want it. A breeder careless about that is careless about the thing that matters most.',
          'On Stud, the registration type is a machine-read term of the sale contract, and your owner portal states it plainly — along with everything else you and the breeder each agreed to.',
        ],
      },
    ],
  },
  {
    slug: 'understanding-coi',
    title: 'COI: the number your puppy already carries',
    description:
      'What the coefficient of inbreeding measures, what counts as high, and why the number is only as good as the pedigree behind it.',
    minutes: 5,
    audience: 'BUYER',
    updated: '2026-07-20',
    body: [
      {
        paragraphs: [
          'The coefficient of inbreeding is the probability that two copies of the same gene in your puppy are identical because they came down both sides of the pedigree from one shared ancestor. Parent-to-offspring or full-sibling matings produce 25%. First cousins produce 6.25%. Most well-planned litters sit in the low single digits.',
          'Higher COI is associated with smaller litters, shorter lifespans and the doubling-up of whatever recessives the shared ancestor carried — good and bad alike. It is not a verdict on an individual puppy; it is a probability statement about risk, and a breeder can hold it down by choosing less related pairings.',
          'The caveat that matters: COI is computed from the pedigree you can see. A 2% figure over three known generations and a 2% figure over eight complete ones are very different claims — shared ancestry above the visible pedigree is invisible to the number. This is why Stud shows the completeness of the pedigree next to every COI and treats a shallow one as a floor, not a fact. When a listing here says 15%, it says so in red, with the relationship spelled out — because a buyer has more right to that number than anyone.',
        ],
      },
    ],
  },
  {
    slug: 'bringing-a-puppy-home',
    title: 'The first 72 hours: what your contract probably requires',
    description:
      'Why almost every good puppy contract requires a vet visit within days of pickup, and what else the first week should include.',
    minutes: 4,
    audience: 'BUYER',
    updated: '2026-07-20',
    body: [
      {
        paragraphs: [
          'Most well-drafted puppy contracts require you to have the puppy examined by your own vet within a short window of collection — 72 hours is common. This is the single most time-critical term in the document, and the one most often missed in the happy chaos of the first days.',
          'The window exists to protect both of you. If your vet finds a pre-existing problem inside it, the contract typically lets you return the puppy for a full refund; the breeder, in turn, is protected from being blamed for something that happened in your care three weeks later. Miss the window and that protection usually lapses — which means the appointment should be booked before the puppy comes home.',
          'The same week: keep the food the breeder sent and change it slowly if at all; register the microchip in your name if the breeder has not already done it; and put the vaccination card somewhere you will find it, because your vet will ask for dates.',
          'If you bought through Stud, your owner portal shows the vet-exam deadline as a date the moment the handover is recorded, along with the chip number, the vaccination record and everything else that came home with the dog.',
        ],
      },
    ],
  },
  {
    slug: 'how-verification-works',
    title: 'What "verified" means on Stud',
    description:
      'The exact rules behind the checkmark: what gets verified, what stays "reported", and why absence is displayed.',
    minutes: 5,
    audience: 'BUYER',
    updated: '2026-07-20',
    body: [
      {
        paragraphs: [
          'Verified on Stud means one thing: we fetched the result from the body that issued it — the orthopaedic registry, the kennel club, the testing lab — and it matched the dog. Not a photograph of a certificate, which is an image of a claim; the record itself, checked at the source, with the check dated.',
          'Anything an owner tells us that we cannot check stays visibly separate, labelled as reported. It never mixes with verified data, never counts toward verified totals, and never silently upgrades. This separation is a structural rule of the database, not a policy — there is no field where the two can meet.',
          'A result can also be stale (verified a while ago, due a recheck) or conflicted — the source now says something different from what we recorded. Conflicts are shown, not hidden, and an open conflict disqualifies a result from every filter and count until a human resolves it.',
          'And absence is displayed. A dog with no hip result shows "not tested" beside the tests that exist for its breed, because the most useful thing a listing can tell you is sometimes what is missing. Classified sites cannot do this — they never knew what was supposed to be there.',
        ],
      },
    ],
  },
];

export const GUIDES_BY_SLUG = new Map(GUIDES.map((g) => [g.slug, g]));

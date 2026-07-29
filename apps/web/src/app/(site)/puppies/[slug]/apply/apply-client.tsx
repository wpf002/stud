'use client';

import { Check, Send } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';

/**
 * The application.
 *
 * Longer than an enquiry on purpose. A breeder placing a dog for the next
 * fifteen years is entitled to know where it is going, and a buyer who will
 * not spend ten minutes on this is telling them something too.
 *
 * What it does NOT ask for: money. No deposit is taken here, and the form says
 * so — a deposit before the breeder has accepted you is a deposit that has to
 * come back, and every buyer who has been burned by a scam listing is watching
 * for exactly that.
 */
export function ApplyClient({
  slug,
  litterName,
  depositCents,
  signedInEmail,
}: {
  slug: string;
  litterName: string;
  depositCents: number | null;
  signedInEmail: string | null;
}) {
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasChildren, setHasChildren] = React.useState(false);
  const [hasOtherPets, setHasOtherPets] = React.useState(false);
  const [hasFencedYard, setHasFencedYard] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => {
      const v = String(fd.get(k) ?? '').trim();
      return v === '' ? undefined : v;
    };
    const num = (k: string) => {
      const v = str(k);
      return v === undefined ? undefined : Number(v);
    };

    try {
      await api(`/litters/public/${encodeURIComponent(slug)}/applications`, {
        method: 'POST',
        json: {
          name: str('name'),
          email: str('email'),
          phone: str('phone'),
          city: str('city'),
          region: str('region'),
          intendedHome: str('intendedHome'),
          homeType: str('homeType'),
          hoursAloneDaily: num('hoursAloneDaily'),
          childrenAges: hasChildren ? str('childrenAges') : undefined,
          otherPetsDetail: hasOtherPets ? str('otherPetsDetail') : undefined,
          previousDogs: str('previousDogs'),
          vetName: str('vetName'),
          vetPhone: str('vetPhone'),
          activityPlans: str('activityPlans'),
          preferredSex: str('preferredSex'),
          preferredColor: str('preferredColor'),
          message: str('message'),
          hasChildren,
          hasOtherPets,
          hasFencedYard,
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send that. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Alert tone="success" icon={<Check className="h-4 w-4" />}>
        <span className="font-semibold">Sent.</span> The breeder has your application. If you have a
        Stud account you can follow where it is at any time from{' '}
        <Link href="/my/applications" className="underline">
          your applications
        </Link>
        .
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* The thing a buyer most needs to hear before filling in a long form. */}
      <Alert tone="info">
        <span className="font-semibold">No payment is taken here.</span> Nothing is due until the
        breeder has read this and accepted you
        {depositCents ? ', and the deposit is taken through Stud after that' : ''}. Anyone asking
        you to send money before that point is not following this process.
      </Alert>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <p className="text-2xs uppercase tracking-widest text-ink-400">You</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required>
              <Input id="name" name="name" required autoComplete="name" />
            </Field>
            <Field label="Email" htmlFor="email" required>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={signedInEmail ?? ''}
              />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" autoComplete="tel" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" htmlFor="city">
                <Input id="city" name="city" autoComplete="address-level2" />
              </Field>
              <Field label="State" htmlFor="region">
                <Input id="region" name="region" autoComplete="address-level1" maxLength={40} />
              </Field>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <p className="text-2xs uppercase tracking-widest text-ink-400">Your Home</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What Kind of Home" htmlFor="homeType">
              <Select id="homeType" name="homeType" defaultValue="">
                <option value="">Choose…</option>
                <option value="House with fenced yard">House with Fenced Yard</option>
                <option value="House without fenced yard">House Without Fenced Yard</option>
                <option value="Apartment or condo">Apartment or Condo</option>
                <option value="Farm or acreage">Farm or Acreage</option>
              </Select>
            </Field>
            <Field
              label="Hours Alone on a Normal Weekday"
              htmlFor="hoursAloneDaily"
              hint="An honest number is more useful than a flattering one."
            >
              <Input id="hoursAloneDaily" name="hoursAloneDaily" type="number" min={0} max={24} />
            </Field>
          </div>

          <div className="space-y-2">
            <Checkbox
              checked={hasFencedYard}
              onChange={(e) => setHasFencedYard(e.target.checked)}
              label="We have a fenced yard"
            />
            <Checkbox
              checked={hasChildren}
              onChange={(e) => setHasChildren(e.target.checked)}
              label="There are children at home"
            />
            {hasChildren && (
              <Field label="Their Ages" htmlFor="childrenAges">
                <Input id="childrenAges" name="childrenAges" placeholder="6 and 9" />
              </Field>
            )}
            <Checkbox
              checked={hasOtherPets}
              onChange={(e) => setHasOtherPets(e.target.checked)}
              label="We have other pets"
            />
            {hasOtherPets && (
              <Field label="Tell Them About Your Other Pets" htmlFor="otherPetsDetail">
                <Input
                  id="otherPetsDetail"
                  name="otherPetsDetail"
                  placeholder="One older Lab, spayed, very tolerant"
                />
              </Field>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <p className="text-2xs uppercase tracking-widest text-ink-400">The Dog</p>

          <Field label="What are you hoping for from this dog" htmlFor="intendedHome">
            <Select id="intendedHome" name="intendedHome" defaultValue="">
              <option value="">Choose…</option>
              <option value="Family companion">Family Companion</option>
              <option value="Companion and sport">Companion and Sport</option>
              <option value="Hunting or field work">Hunting or Field Work</option>
              <option value="Conformation">Conformation Showing</option>
              <option value="Service or therapy prospect">Service or Therapy Prospect</option>
              <option value="Breeding prospect">Breeding Prospect</option>
            </Select>
          </Field>

          <Field
            label="Dogs You Have Had"
            htmlFor="previousDogs"
            hint="Including any you no longer have, and what happened. Breeders are far more interested in honesty here than in a perfect record."
          >
            <Textarea id="previousDogs" name="previousDogs" rows={3} />
          </Field>

          <Field label="What This Dog's Life Will Look Like" htmlFor="activityPlans">
            <Textarea
              id="activityPlans"
              name="activityPlans"
              rows={3}
              placeholder="Exercise, training, where it sleeps, who is home during the day."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your Vet" htmlFor="vetName">
              <Input id="vetName" name="vetName" />
            </Field>
            <Field label="Their Phone" htmlFor="vetPhone">
              <Input id="vetPhone" name="vetPhone" type="tel" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Sex You Would Prefer"
              htmlFor="preferredSex"
              hint="A preference, not a promise — a good breeder matches on temperament."
            >
              <Select id="preferredSex" name="preferredSex" defaultValue="EITHER">
                <option value="EITHER">No Preference</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
              </Select>
            </Field>
            <Field label="Colour or Markings" htmlFor="preferredColor">
              <Input id="preferredColor" name="preferredColor" placeholder="No preference" />
            </Field>
          </div>

          <Field
            label="Anything You Want to Say"
            htmlFor="message"
            hint="This is the part they will read first."
          >
            <Textarea id="message" name="message" rows={5} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-2xs leading-relaxed text-ink-400">
          Applying to {litterName} does not commit you to anything, and the breeder is under no
          obligation to accept. You can withdraw at any point.
        </p>
        <Button type="submit" size="lg" loading={busy}>
          <Send /> Send Application
        </Button>
      </div>
    </form>
  );
}

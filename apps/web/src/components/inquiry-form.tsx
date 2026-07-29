'use client';

import { Check, Send } from 'lucide-react';
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
 * The first contact between a buyer and a breeder.
 *
 * Two decisions worth stating:
 *
 * 1. **No account required.** Forcing a signup before a first question is how
 *    a marketplace loses the buyer who was only half sure. If they are signed
 *    in the API links the enquiry to them; if not, the email is enough.
 *
 * 2. **It asks the household questions up front.** Every breeder asks the same
 *    four things in their first reply. Asking them here turns a four-message
 *    exchange into one, and a breeder reading twenty enquiries a week is the
 *    person that actually helps.
 */
export function InquiryForm({
  slug,
  puppies,
}: {
  slug: string;
  puppies: { id: string; label: string; sex: 'MALE' | 'FEMALE' }[];
}) {
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasOtherDogs, setHasOtherDogs] = React.useState(false);
  const [hasChildren, setHasChildren] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => {
      const v = String(fd.get(k) ?? '').trim();
      return v === '' ? undefined : v;
    };

    try {
      await api(`/litters/public/${encodeURIComponent(slug)}/inquiries`, {
        method: 'POST',
        json: {
          name: str('name'),
          email: str('email'),
          phone: str('phone'),
          message: str('message'),
          puppyId: str('puppyId'),
          householdNotes: str('householdNotes'),
          homeType: str('homeType'),
          hasOtherDogs,
          hasChildren,
        },
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not send that. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Alert tone="success" icon={<Check className="h-4 w-4" />}>
        <span className="font-semibold">Sent.</span> The breeder has it, along with your household
        details so they can answer properly rather than asking the same four questions back.
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="font-display text-lg text-ink-900">Ask About This Litter</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          Goes straight to the breeder. No account needed.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}

          <Field label="Your name" htmlFor="name" required>
            <Input id="name" name="name" required inputSize="sm" autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              name="email"
              type="email"
              required
              inputSize="sm"
              autoComplete="email"
            />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" inputSize="sm" autoComplete="tel" />
          </Field>

          {puppies.length > 0 && (
            <Field label="A puppy in particular?" htmlFor="puppyId">
              <Select id="puppyId" name="puppyId" inputSize="sm" defaultValue="">
                <option value="">No preference yet</option>
                {puppies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.sex === 'MALE' ? 'male' : 'female'})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Your message" htmlFor="message" required>
            <Textarea id="message" name="message" rows={4} required minLength={10} />
          </Field>

          <div className="space-y-2 rounded-md bg-bone-100 px-3 py-3">
            <p className="text-2xs uppercase tracking-widest text-ink-400">
              About your home — optional, but it saves a round trip
            </p>
            <Field label="Home" htmlFor="homeType">
              <Select id="homeType" name="homeType" inputSize="sm" defaultValue="">
                <option value="">Prefer not to say</option>
                <option value="House with fenced yard">House with fenced yard</option>
                <option value="House without fenced yard">House without fenced yard</option>
                <option value="Apartment or condo">Apartment or condo</option>
                <option value="Farm or acreage">Farm or acreage</option>
              </Select>
            </Field>
            <Checkbox
              checked={hasOtherDogs}
              onChange={(e) => setHasOtherDogs(e.target.checked)}
              label="We have other dogs"
            />
            <Checkbox
              checked={hasChildren}
              onChange={(e) => setHasChildren(e.target.checked)}
              label="We have children at home"
            />
            <Field label="Anything else worth knowing" htmlFor="householdNotes">
              <Textarea id="householdNotes" name="householdNotes" rows={2} />
            </Field>
          </div>

          <Button type="submit" block loading={busy}>
            <Send /> Send Enquiry
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

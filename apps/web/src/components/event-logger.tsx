'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Select,
  Textarea,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';

const KINDS = [
  { value: 'VET_VISIT', label: 'Vet visit' },
  { value: 'VACCINATION', label: 'Vaccination' },
  { value: 'ILLNESS', label: 'Illness' },
  { value: 'INJURY', label: 'Injury' },
  { value: 'SURGERY', label: 'Surgery' },
  { value: 'MEDICATION', label: 'Medication' },
  { value: 'ALTERATION', label: 'Spay or neuter' },
  { value: 'WEIGHT', label: 'Weight' },
  { value: 'OTHER', label: 'Something else' },
];

/**
 * The owner logging what happened.
 *
 * `sharedWithBreeder` defaults on, and the reason is given rather than
 * assumed: a breeding program only improves if what happened to the puppies
 * comes back. An owner can turn it off for anything — it is their dog and
 * their vet bills — and turning it off is one click, not buried in settings.
 */
export function EventLogger({ slug, dogName }: { slug: string; dogName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [shared, setShared] = React.useState(true);
  const [kind, setKind] = React.useState('VET_VISIT');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => {
      const v = String(fd.get(k) ?? '').trim();
      return v === '' ? undefined : v;
    };
    const pounds = str('weightLb');

    try {
      await api(`/my/dogs/${encodeURIComponent(slug)}/events`, {
        method: 'POST',
        json: {
          kind,
          occurredOn: str('occurredOn'),
          title: str('title'),
          detail: str('detail'),
          vetName: str('vetName'),
          // Owners think in pounds; the record stores grams.
          weightGrams: pounds ? Math.round(Number(pounds) * 453.592) : undefined,
          sharedWithBreeder: shared,
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Plus /> Log Something
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log something for {dogName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody>
            {error && <Alert tone="danger">{error}</Alert>}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="What Kind" htmlFor="kind" required>
                <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="When" htmlFor="occurredOn" required>
                <Input
                  id="occurredOn"
                  name="occurredOn"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </Field>
            </div>

            <Field label="In a Few Words" htmlFor="title" required>
              <Input id="title" name="title" required placeholder="Second DHPP" />
            </Field>

            {kind === 'WEIGHT' && (
              <Field label="Weight (lb)" htmlFor="weightLb">
                <Input id="weightLb" name="weightLb" type="number" step="0.1" min="0.2" />
              </Field>
            )}

            <Field label="Your Vet" htmlFor="vetName">
              <Input id="vetName" name="vetName" />
            </Field>

            <Field label="Anything Else" htmlFor="detail">
              <Textarea id="detail" name="detail" rows={3} />
            </Field>

            <div className="rounded-md bg-bone-100 px-3 py-2.5">
              <Checkbox
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
                label="Share this with your breeder"
              />
              <p className="mt-1.5 text-2xs leading-relaxed text-ink-500">
                On by default. A breeder who never hears what happened to their puppies cannot
                breed better ones — and if anything here ever bears on your health guarantee, they
                will already know about it. Turn it off for anything you would rather keep private.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

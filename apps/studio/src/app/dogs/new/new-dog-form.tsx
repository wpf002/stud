'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Alert, Button, Card, CardContent, Field, Input, Select, Textarea } from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { DogSummary } from '@/lib/types';

const REGISTRIES = ['AKC', 'UKC', 'CKC', 'FCI', 'KC', 'NAVHDA', 'AFTCA', 'ABCA', 'JRTCA', 'CONTINENTAL', 'OTHER'];

export function NewDogForm({ dogs, kennelId }: { dogs: DogSummary[]; kennelId?: string }) {
  const router = useRouter();
  const [sex, setSex] = React.useState<'MALE' | 'FEMALE'>('MALE');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sires = dogs.filter((d) => d.sex === 'MALE');
  const dams = dogs.filter((d) => d.sex === 'FEMALE');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const str = (k: string) => (String(f.get(k) ?? '').trim() || undefined);
    const num = (k: string) => {
      const v = str(k);
      return v ? Number(v) : undefined;
    };

    try {
      const regNumber = str('regNumber');
      const dog = await api<{ dog: { slug: string } }>('/dogs', {
        method: 'POST',
        json: {
          callName: str('callName'),
          registeredName: str('registeredName'),
          breed: str('breed'),
          sex,
          dateOfBirth: str('dateOfBirth'),
          colorPattern: str('colorPattern'),
          markings: str('markings'),
          heightCm: num('heightCm'),
          weightKg: num('weightKg'),
          microchip: str('microchip'),
          temperamentNotes: str('temperamentNotes'),
          kennelId,
          sireId: str('sireId') ?? null,
          damId: str('damId') ?? null,
          registrations: regNumber
            ? [{ body: String(f.get('regBody')), number: regNumber, isPrimary: true }]
            : undefined,
        },
      });
      router.push(`/dogs/${dog.dog.slug}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that dog.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardContent className="space-y-4 pt-5">
          <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">Identity</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Call name" htmlFor="callName" required hint="What you actually shout across a field.">
              <Input id="callName" name="callName" required maxLength={80} placeholder="Ranger" />
            </Field>
            <Field label="Registered name" htmlFor="registeredName">
              <Input
                id="registeredName"
                name="registeredName"
                maxLength={200}
                placeholder="Blackwater's Ranger Of The Marsh"
              />
            </Field>
            <Field label="Breed" htmlFor="breed" required>
              <Input id="breed" name="breed" required defaultValue="German Shorthaired Pointer" />
            </Field>
            <Field label="Sex" htmlFor="sex" required>
              <Select id="sex" value={sex} onChange={(e) => setSex(e.target.value as 'MALE' | 'FEMALE')}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </Select>
            </Field>
            <Field label="Date of birth" htmlFor="dateOfBirth">
              <Input id="dateOfBirth" name="dateOfBirth" type="date" />
            </Field>
            <Field label="Microchip" htmlFor="microchip">
              <Input id="microchip" name="microchip" maxLength={40} className="font-mono" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
            Registration
          </p>
          <p className="text-xs leading-relaxed text-ink-500">
            The registration number is what verification keys on in Phase 2. Without it, health
            results and titles can never move past &ldquo;Reported&rdquo;.
          </p>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field label="Registry" htmlFor="regBody">
              <Select id="regBody" name="regBody" defaultValue="AKC">
                {REGISTRIES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Number" htmlFor="regNumber">
              <Input id="regNumber" name="regNumber" maxLength={60} placeholder="SR91234501" className="font-mono" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">Parents</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sire" htmlFor="sireId" hint="Leave blank if unknown — a gap is honest.">
              <Select id="sireId" name="sireId" defaultValue="">
                <option value="">Unknown</option>
                {sires.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.registeredName ?? d.callName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dam" htmlFor="damId">
              <Select id="damId" name="damId" defaultValue="">
                <option value="">Unknown</option>
                {dams.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.registeredName ?? d.callName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
            Physical &amp; temperament
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Colour / pattern" htmlFor="colorPattern">
              <Input id="colorPattern" name="colorPattern" maxLength={120} placeholder="Liver roan" />
            </Field>
            <Field label="Markings" htmlFor="markings">
              <Input id="markings" name="markings" maxLength={400} />
            </Field>
            <Field label="Height (cm)" htmlFor="heightCm">
              <Input id="heightCm" name="heightCm" type="number" step="0.5" min="5" max="120" />
            </Field>
            <Field label="Weight (kg)" htmlFor="weightKg">
              <Input id="weightKg" name="weightKg" type="number" step="0.1" min="0.05" max="120" />
            </Field>
          </div>
          <Field
            label="Temperament notes"
            htmlFor="temperamentNotes"
            hint="Self-reported. It renders as a Reported claim and is never presented as verified."
          >
            <Textarea id="temperamentNotes" name="temperamentNotes" rows={3} maxLength={4000} />
          </Field>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" loading={pending} size="lg">
          Save dog
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

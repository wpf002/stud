'use client';

import { AlertTriangle, ArrowRight, Scale } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  Input,
  Select,
  Textarea,
  cn,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { ClauseDto, TemplatesResponse } from '@/lib/types';

interface DogOption {
  id: string;
  callName: string;
  sex: 'MALE' | 'FEMALE';
  registrations: { registry: string; number: string }[];
}

/** Values keyed clause id → variable key. Mirrors the API's `values` shape. */
type Values = Record<string, Record<string, string>>;

export function NewContractClient({
  templates,
  dogs,
}: {
  templates: TemplatesResponse;
  dogs: DogOption[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = React.useState(templates.templates[0]?.id ?? 'STUD_SERVICE');
  const [myRole, setMyRole] = React.useState<'STUD_OWNER' | 'BITCH_OWNER' | 'CO_OWNER'>('STUD_OWNER');
  const [counterpartyEmail, setCounterpartyEmail] = React.useState('');
  const [sireId, setSireId] = React.useState('');
  const [damId, setDamId] = React.useState('');
  const [values, setValues] = React.useState<Values>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const template = templates.templates.find((t) => t.id === templateId) ?? templates.templates[0];
  const clauseById = React.useMemo(
    () => new Map(templates.clauses.map((c) => [c.id, c] as const)),
    [templates.clauses],
  );
  const clauses = (template?.clauseIds ?? [])
    .map((id) => clauseById.get(id))
    .filter((c): c is ClauseDto => Boolean(c));

  const sires = dogs.filter((d) => d.sex === 'MALE');
  const dams = dogs.filter((d) => d.sex === 'FEMALE');

  function set(clauseId: string, key: string, value: string) {
    setValues((prev) => ({ ...prev, [clauseId]: { ...(prev[clauseId] ?? {}), [key]: value } }));
  }

  function valueOf(clause: ClauseDto, key: string): string {
    const explicit = values[clause.id]?.[key];
    if (explicit !== undefined) return explicit;
    const v = clause.variables.find((x) => x.key === key);
    return v?.defaultValue == null ? '' : String(v.defaultValue);
  }

  /**
   * Pull the animal facts out of the record rather than asking the drafter to
   * retype them. A registration number typed by hand into a contract is a
   * registration number that will be wrong.
   */
  React.useEffect(() => {
    const sire = sires.find((d) => d.id === sireId);
    const dam = dams.find((d) => d.id === damId);
    if (!sire && !dam) return;
    setValues((prev) => {
      const partyClause = clauses.find((c) => c.category === 'PARTIES');
      if (!partyClause) return prev;
      const next = { ...(prev[partyClause.id] ?? {}) };
      if (sire) {
        next.sireName = sire.callName;
        const reg = sire.registrations[0];
        if (reg) next.sireRegistration = `${reg.registry} ${reg.number}`;
      }
      if (dam) {
        next.damName = dam.callName;
        const reg = dam.registrations[0];
        if (reg) next.damRegistration = `${reg.registry} ${reg.number}`;
      }
      return { ...prev, [partyClause.id]: next };
    });
    // `clauses` is derived from templateId; depending on it directly would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sireId, damId, templateId]);

  // Deposit + balance must equal the total. The API validates it too, but
  // catching it while the drafter is still typing is worth more.
  const feeClause = clauses.find((c) => c.variables.some((v) => v.key === 'feeTotal'));
  const feeMismatch = React.useMemo(() => {
    if (!feeClause) return null;
    const n = (k: string) => Number(valueOf(feeClause, k).replace(/[^0-9.]/g, ''));
    const [total, deposit, balance] = [n('feeTotal'), n('depositAmount'), n('balanceAmount')];
    if (!total || (!deposit && !balance)) return null;
    return Math.abs(deposit + balance - total) > 0.005
      ? `Deposit and balance come to ${(deposit + balance).toFixed(2)}, but the total fee is ${total.toFixed(2)}.`
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeClause, values]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Money reaches the API as integer cents, and as a NUMBER — validation
      // requires an integer, and the string "220000" is not one. Conversion
      // happens once, here at the edge, never carried around as a float.
      const payload: Record<string, Record<string, string | number>> = {};
      for (const clause of clauses) {
        const out: Record<string, string | number> = {};
        for (const v of clause.variables) {
          const raw = valueOf(clause, v.key);
          if (raw === '') continue;
          if (v.kind === 'MONEY_CENTS') {
            out[v.key] = Math.round(Number(raw.replace(/[^0-9.]/g, '')) * 100);
          } else if (v.kind === 'INTEGER') {
            out[v.key] = Math.round(Number(raw));
          } else {
            out[v.key] = raw;
          }
        }
        if (Object.keys(out).length > 0) payload[clause.id] = out;
      }

      const res = await api<{ contract: { id: string } }>('/contracts', {
        method: 'POST',
        json: {
          templateId,
          myRole,
          counterpartyEmail,
          sireId: sireId || undefined,
          damId: damId || undefined,
          values: payload,
        },
      });
      router.push(`/contracts/${res.contract.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the contract.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* The disclaimer reaches the drafter, not a footer they scroll past. */}
      <Alert tone="warning" icon={<Scale className="h-4 w-4" />}>
        <span className="font-semibold">A starting point, not legal advice.</span>{' '}
        {templates.disclaimer.replace(/^These templates are drafting starting points, not legal advice\.\s*/, '')}
      </Alert>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardContent className="space-y-4 pt-5">
          <p className="text-2xs uppercase tracking-widest text-ink-400">1 — Agreement type</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={cn(
                  'rounded-lg border p-3 text-left transition',
                  t.id === templateId
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-bone-300 hover:border-bone-400',
                )}
              >
                <p className="text-sm font-semibold text-ink-900">{t.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">{t.description}</p>
              </button>
            ))}
          </div>
          {template?.guidance && (
            <p className="rounded-md bg-bone-100 px-3 py-2 text-xs leading-relaxed text-ink-600">
              {template.guidance}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <p className="text-2xs uppercase tracking-widest text-ink-400">2 — Parties and animals</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="My side of it" htmlFor="myRole" required>
              <Select
                id="myRole"
                value={myRole}
                onChange={(e) => setMyRole(e.target.value as typeof myRole)}
              >
                <option value="STUD_OWNER">I own the stud</option>
                <option value="BITCH_OWNER">I own the bitch</option>
                <option value="CO_OWNER">Co-ownership</option>
              </Select>
            </Field>
            <Field
              label="Counterparty email"
              htmlFor="counterpartyEmail"
              required
              hint="They need a Stud account — a signature has to be tied to an authenticated identity, not a typed name."
            >
              <Input
                id="counterpartyEmail"
                type="email"
                required
                value={counterpartyEmail}
                onChange={(e) => setCounterpartyEmail(e.target.value)}
                placeholder="name@kennel.com"
              />
            </Field>
            <Field label="Sire" htmlFor="sireId">
              <Select id="sireId" value={sireId} onChange={(e) => setSireId(e.target.value)}>
                <option value="">Not from my kennel</option>
                {sires.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.callName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Dam" htmlFor="damId">
              <Select id="damId" value={damId} onChange={(e) => setDamId(e.target.value)}>
                <option value="">Not from my kennel</option>
                {dams.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.callName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="text-2xs leading-relaxed text-ink-400">
            Naming both animals attaches their health testing to the document automatically, marked
            verified or self-reported. Nobody retypes a test result into a contract.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-5 pt-5">
          <p className="text-2xs uppercase tracking-widest text-ink-400">3 — Terms</p>
          {feeMismatch && <Alert tone="danger">{feeMismatch}</Alert>}

          {clauses.map((clause) => {
            if (clause.variables.length === 0) return null;
            return (
              <section key={clause.id} className="border-t border-bone-200 pt-4 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-md text-ink-900">{clause.title}</h3>
                  {clause.effects?.definesNoLitterRemedy && (
                    <Badge tone="brand" size="sm">
                      sets the refund position
                    </Badge>
                  )}
                  {clause.effects?.definesBalanceTrigger && (
                    <Badge tone="brand" size="sm">
                      sets when the balance falls due
                    </Badge>
                  )}
                </div>
                {clause.drafterNote && (
                  <p className="mt-1 flex gap-1.5 text-xs leading-relaxed text-ink-500">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clay-500" />
                    {clause.drafterNote}
                  </p>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {clause.variables.map((v) => (
                    <Field
                      key={v.key}
                      label={v.label}
                      htmlFor={`${clause.id}.${v.key}`}
                      required={v.required}
                      hint={v.help}
                      className={v.kind === 'CHOICE' || v.options ? 'sm:col-span-2' : undefined}
                    >
                      {v.kind === 'CHOICE' && v.options ? (
                        <Select
                          id={`${clause.id}.${v.key}`}
                          value={valueOf(clause, v.key)}
                          onChange={(e) => set(clause.id, v.key, e.target.value)}
                        >
                          <option value="">Choose…</option>
                          {v.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      ) : v.kind === 'MONEY_CENTS' ? (
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
                            $
                          </span>
                          <Input
                            id={`${clause.id}.${v.key}`}
                            inputMode="decimal"
                            className="pl-7 tabular-nums"
                            value={valueOf(clause, v.key)}
                            onChange={(e) => set(clause.id, v.key, e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      ) : v.kind === 'DATE' ? (
                        <Input
                          id={`${clause.id}.${v.key}`}
                          type="date"
                          value={valueOf(clause, v.key)}
                          onChange={(e) => set(clause.id, v.key, e.target.value)}
                        />
                      ) : v.kind === 'INTEGER' ? (
                        <Input
                          id={`${clause.id}.${v.key}`}
                          type="number"
                          min={0}
                          step={1}
                          value={valueOf(clause, v.key)}
                          onChange={(e) => set(clause.id, v.key, e.target.value)}
                        />
                      ) : v.key === 'methodDetail' || v.key === 'buyoutTerms' ? (
                        <Textarea
                          id={`${clause.id}.${v.key}`}
                          rows={2}
                          value={valueOf(clause, v.key)}
                          onChange={(e) => set(clause.id, v.key, e.target.value)}
                        />
                      ) : (
                        <Input
                          id={`${clause.id}.${v.key}`}
                          value={valueOf(clause, v.key)}
                          onChange={(e) => set(clause.id, v.key, e.target.value)}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </section>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <p className="text-2xs text-ink-400">You can keep editing until it is sent.</p>
        <Button type="submit" loading={busy} disabled={!counterpartyEmail}>
          Create draft <ArrowRight />
        </Button>
      </div>
    </form>
  );
}

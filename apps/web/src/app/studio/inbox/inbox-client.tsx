'use client';

import { AlertTriangle, Check, Inbox as InboxIcon, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Textarea,
  cn,
  formatCoi,
  formatDateTime,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { StudInquiryDto } from '@/lib/types';

/**
 * The stud owner's inbox.
 *
 * This is the adverse-selection control the whole inquiry flow exists for. A
 * classified board gives a stud owner a paragraph of text and a phone number;
 * here they get the bitch's verified health, her COI, the projected litter COI
 * and any at-risk genetic pairing — before replying.
 *
 * The consequence is that a well-written email from someone with an untested
 * bitch no longer outranks a terse one from someone with a fully panelled one.
 */
export function InboxClient({ initial }: { initial: StudInquiryDto[] }) {
  const router = useRouter();
  const [inquiries, setInquiries] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  async function update(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/studs/inquiries/${id}`, { method: 'PATCH', json: body });
      setInquiries((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...(body as Partial<StudInquiryDto>) } : i)),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update that.');
    }
  }

  if (inquiries.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon className="h-5 w-5" />}
        title="No inquiries"
        description="When a breeder enquires about one of your studs, their bitch's verified health, her pedigree and the projected litter COI arrive with the message."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {inquiries.map((i) => (
        <InquiryCard key={i.id} inquiry={i} onUpdate={update} />
      ))}
    </div>
  );
}

function InquiryCard({
  inquiry,
  onUpdate,
}: {
  inquiry: StudInquiryDto;
  onUpdate: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [replying, setReplying] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const dam = inquiry.dam;
  const summary = dam?.verificationSummary;
  const atRisk = inquiry.atRiskMarkerCount > 0;

  async function reply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const message = String(new FormData(e.currentTarget).get('replyMessage') || '');
    await onUpdate(inquiry.id, { replyMessage: message, status: 'REPLIED' });
    setReplying(false);
    setBusy(false);
  }

  const isNew = inquiry.status === 'NEW';

  return (
    <Card className={cn(isNew && 'border-brand-300', atRisk && 'border-danger/30')}>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg text-ink-900">
                {inquiry.fromUser.displayName ?? 'A breeder'}
              </span>
              {isNew && (
                <Badge tone="brand" size="sm">
                  new
                </Badge>
              )}
              {inquiry.status !== 'NEW' && (
                <Badge tone="neutral" size="sm">
                  {inquiry.status.toLowerCase()}
                </Badge>
              )}
            </p>
            <p className="mt-0.5 text-2xs text-ink-400">
              about {inquiry.studListing.dog.callName}
              {inquiry.fromUser.city ? ` · ${inquiry.fromUser.city}, ${inquiry.fromUser.region}` : ''}
              {' · '}
              {formatDateTime(inquiry.createdAt)}
            </p>
          </div>
        </div>

        {/* The evidence, before the message. */}
        {dam && (
          <div className="mt-4 rounded-md border border-bone-300 bg-bone-100 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-ink-800">
                Proposed bitch:{' '}
                <Link href={`/studio/dogs/${dam.slug}`} className="text-brand-700 hover:underline">
                  {dam.registeredName ?? dam.callName}
                </Link>
              </p>
              {dam.kennel && <p className="text-2xs text-ink-400">{dam.kennel.name}</p>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric
                label="Her verification"
                value={summary ? `${Math.round(summary.density * 100)}%` : '—'}
                sub={summary ? `${summary.verifiedCount} claims` : 'nothing verified'}
                tone={summary && summary.density > 0.6 ? 'good' : summary ? undefined : 'warn'}
              />
              <Metric
                label="Health normal"
                value={summary ? String(summary.healthNormalCount) : '—'}
              />
              <Metric
                label="Her COI"
                value={dam.pedigreeStats ? formatCoi(dam.pedigreeStats.coi) : '—'}
              />
              <Metric
                label="Litter COI"
                value={inquiry.projectedCoi != null ? formatCoi(inquiry.projectedCoi) : '—'}
                sub={inquiry.coiGenerations ? `${inquiry.coiGenerations} gen` : undefined}
                tone={
                  inquiry.projectedCoi == null
                    ? undefined
                    : inquiry.projectedCoi < 0.0625
                      ? 'good'
                      : 'warn'
                }
              />
            </div>

            {atRisk ? (
              <p className="mt-3 flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger-fg">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {inquiry.geneticRiskSummary ??
                  `${inquiry.atRiskMarkerCount} genetic marker(s) would produce affected puppies.`}
              </p>
            ) : inquiry.geneticRiskSummary ? (
              <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                {inquiry.geneticRiskSummary}
              </p>
            ) : null}

            {!summary?.verifiedCount && (
              <p className="mt-3 text-2xs leading-relaxed text-warning-fg">
                None of this bitch&rsquo;s health testing has been verified yet, so the claims
                in this message can&rsquo;t be checked from here.
              </p>
            )}
          </div>
        )}

        {!dam && (
          <p className="mt-4 rounded-md bg-bone-100 px-3 py-2 text-xs text-ink-500">
            No bitch attached — this is an exploratory enquiry, so there is nothing to evaluate yet.
          </p>
        )}

        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-700">
          {inquiry.message}
        </p>

        {(inquiry.proposedSeason || inquiry.proposedMethod) && (
          <p className="mt-2 text-2xs text-ink-400">
            {inquiry.proposedSeason ? `Season: ${inquiry.proposedSeason}` : ''}
            {inquiry.proposedSeason && inquiry.proposedMethod ? ' · ' : ''}
            {inquiry.proposedMethod ? `Method: ${inquiry.proposedMethod}` : ''}
          </p>
        )}

        {inquiry.replyMessage && (
          <div className="mt-4 rounded-md border-l-2 border-brand-400 bg-brand-50/50 px-3 py-2">
            <p className="text-2xs uppercase tracking-widest text-ink-400">Your reply</p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{inquiry.replyMessage}</p>
          </div>
        )}

        {replying ? (
          <form onSubmit={reply} className="mt-4 space-y-2">
            <Textarea name="replyMessage" rows={4} required placeholder="Your reply…" autoFocus />
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={busy}>
                Send reply
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setReplying(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-bone-200 pt-4">
            <Button size="sm" onClick={() => setReplying(true)}>
              Reply
            </Button>
            <Button size="sm" variant="outline" onClick={() => onUpdate(inquiry.id, { status: 'ACCEPTED' })}>
              <Check /> Accept
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onUpdate(inquiry.id, { status: 'DECLINED' })}>
              <X /> Decline
            </Button>
            {isNew && (
              <Button size="sm" variant="ghost" onClick={() => onUpdate(inquiry.id, { status: 'READ' })}>
                Mark read
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-widest text-ink-400">{label}</p>
      <p
        className={cn(
          'font-mono text-md tabular-nums',
          tone === 'good' ? 'text-brand-700' : tone === 'warn' ? 'text-warning-fg' : 'text-ink-800',
        )}
      >
        {value}
      </p>
      {sub && <p className="text-2xs text-ink-400">{sub}</p>}
    </div>
  );
}

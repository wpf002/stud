'use client';

import { Baby, Check, Dog, Home, Mail, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as React from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Textarea,
  relativeTime,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { LitterInquiryDto } from '@/lib/types';

/**
 * Buyer enquiries on a litter.
 *
 * Every enquiry arrives with the household answers the breeder would otherwise
 * have to ask for in a first reply — home type, other dogs, children. That is
 * the whole design: a breeder reading twenty of these a week can triage them
 * without sending twenty identical follow-up emails.
 */
export function BuyerInquiries({ initial }: { initial: LitterInquiryDto[] }) {
  const router = useRouter();
  const [inquiries, setInquiries] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  async function reply(id: string, replyMessage: string) {
    try {
      const res = await api<{ inquiry: LitterInquiryDto }>(`/litter-inquiries/${id}`, {
        method: 'PATCH',
        json: { replyMessage },
      });
      setInquiries((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...res.inquiry } : i)),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send that reply.');
    }
  }

  if (inquiries.length === 0) {
    return (
      <EmptyState
        icon={<Mail className="h-5 w-5" />}
        title="No enquiries yet"
        description="Publish a litter and enquiries land here, each one with the buyer's household details attached so your first reply can be an answer rather than four more questions."
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      {inquiries.map((i) => (
        <InquiryCard key={i.id} inquiry={i} onReply={reply} />
      ))}
    </div>
  );
}

function InquiryCard({
  inquiry: i,
  onReply,
}: {
  inquiry: LitterInquiryDto;
  onReply: (id: string, message: string) => Promise<void>;
}) {
  const [replying, setReplying] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    await onReply(i.id, String(new FormData(e.currentTarget).get('replyMessage') || ''));
    setBusy(false);
    setReplying(false);
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg text-ink-900">{i.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-2xs text-ink-400">
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" /> {i.email}
              </span>
              {i.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {i.phone}
                </span>
              )}
              <span>{relativeTime(i.createdAt)}</span>
            </p>
            <p className="mt-1 text-2xs text-ink-400">
              on{' '}
              <Link href={`/litters/${i.litterListing.litterId}?tab=listing`} className="hover:text-brand-600">
                {i.litterListing.headline ?? i.litterListing.slug}
              </Link>
              {i.puppy && (
                <>
                  {' — asked about '}
                  <span className="text-ink-600">
                    {i.puppy.name ?? i.puppy.collarColor} ({i.puppy.sex.toLowerCase()})
                  </span>
                </>
              )}
            </p>
          </div>
          <Badge
            tone={i.status === 'NEW' ? 'brand' : i.status === 'REPLIED' ? 'neutral' : 'neutral'}
            size="sm"
          >
            {i.status.toLowerCase()}
          </Badge>
        </div>

        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-700">{i.message}</p>

        {/* The answers that would otherwise cost a round trip. */}
        {(i.homeType || i.hasOtherDogs != null || i.hasChildren != null || i.householdNotes) && (
          <div className="mt-3 rounded-md bg-bone-100 px-3 py-2.5">
            <p className="text-2xs uppercase tracking-widest text-ink-400">Their household</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
              {i.homeType && (
                <span className="flex items-center gap-1.5">
                  <Home className="h-3.5 w-3.5 text-ink-400" /> {i.homeType}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Dog className="h-3.5 w-3.5 text-ink-400" />
                {i.hasOtherDogs ? 'Has other dogs' : 'No other dogs'}
              </span>
              <span className="flex items-center gap-1.5">
                <Baby className="h-3.5 w-3.5 text-ink-400" />
                {i.hasChildren ? 'Children at home' : 'No children at home'}
              </span>
            </div>
            {i.householdNotes && (
              <p className="mt-2 text-xs leading-relaxed text-ink-600">{i.householdNotes}</p>
            )}
          </div>
        )}

        {i.replyMessage ? (
          <div className="mt-3 border-l-2 border-brand-300 pl-3">
            <p className="flex items-center gap-1.5 text-2xs uppercase tracking-widest text-ink-400">
              <Check className="h-3 w-3 text-brand-600" /> You replied {relativeTime(i.repliedAt)}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-600">
              {i.replyMessage}
            </p>
          </div>
        ) : replying ? (
          <form onSubmit={submit} className="mt-3 space-y-2">
            <Field label="Your reply" htmlFor={`reply-${i.id}`}>
              <Textarea id={`reply-${i.id}`} name="replyMessage" rows={4} required autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setReplying(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={busy}>
                Send reply
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setReplying(true)}>
            Reply
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

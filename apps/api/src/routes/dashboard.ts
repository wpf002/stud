import { forecastWhelp, litterMilestones, predictNextHeat } from '@stud/breeding';
import type { FastifyInstance } from 'fastify';

/**
 * The breeder dashboard.
 *
 * One request, because the answer to "what needs me today?" should not take
 * six round trips. Everything here is scoped to dogs the caller can actually
 * see, and every prediction carries its confidence so the UI can order by
 * urgency rather than by date alone.
 */
export default async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', async (req) => {
    const user = await app.requireUser(req);
    const now = new Date();

    const mine = {
      OR: [
        { ownerships: { some: { userId: user.id, endedAt: null } } },
        { kennel: { memberships: { some: { userId: user.id, acceptedAt: { not: null } } } } },
      ],
    };

    const [dogs, kennels] = await Promise.all([
      app.db.dog.findMany({
        where: { ...mine, supersededByDogId: null, isAncestorStub: false },
        select: {
          id: true, slug: true, callName: true, sex: true, breed: true, isRetired: true,
          heatCycles: { orderBy: { startedOn: 'desc' }, select: { startedOn: true, endedOn: true } },
          verificationSummary: { select: { density: true, verifiedCount: true, conflictedCount: true } },
        },
      }),
      app.db.membership.findMany({
        where: { userId: user.id, acceptedAt: { not: null } },
        include: { kennel: { select: { id: true, name: true, slug: true } } },
      }),
    ]);

    const dogIds = dogs.map((d) => d.id);

    const [breedings, litters, dueTasks, openConflicts] = await Promise.all([
      app.db.breeding.findMany({
        where: { damId: { in: dogIds }, status: { in: ['PLANNED', 'BRED', 'CONFIRMED_PREGNANT'] } },
        include: {
          sire: { select: { id: true, callName: true } },
          dam: { select: { id: true, callName: true } },
          events: { select: { occurredOn: true }, orderBy: { occurredOn: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      app.db.litter.findMany({
        where: { damId: { in: dogIds }, status: { in: ['EXPECTED', 'WHELPING', 'ON_THE_GROUND', 'WEANED'] } },
        include: {
          sire: { select: { id: true, callName: true } },
          dam: { select: { id: true, callName: true } },
          puppies: { select: { id: true, sex: true, status: true } },
        },
        orderBy: [{ whelpedOn: 'desc' }, { expectedWhelpOn: 'asc' }],
      }),
      app.db.careTask.findMany({
        where: {
          status: 'PENDING',
          dueOn: { lte: new Date(now.getTime() + 14 * 86_400_000) },
          OR: [{ litter: { damId: { in: dogIds } } }, { dogId: { in: dogIds } }],
        },
        orderBy: { dueOn: 'asc' },
        take: 30,
        include: {
          litter: { select: { id: true, name: true, letter: true, dam: { select: { callName: true } } } },
          dog: { select: { id: true, slug: true, callName: true } },
        },
      }),
      app.db.verifiedClaim.count({ where: { dogId: { in: dogIds }, state: 'CONFLICTED' } }),
    ]);

    // ── Upcoming heats ──
    // Only intact females that are not retired. A prediction for a spayed
    // bitch is noise on a dashboard whose whole value is signal.
    const upcomingHeats = dogs
      .filter((d) => d.sex === 'FEMALE' && !d.isRetired)
      .map((d) => ({
        dog: { id: d.id, slug: d.slug, callName: d.callName, breed: d.breed },
        prediction: predictNextHeat(d.heatCycles, now),
      }))
      .filter((h) => h.prediction.predictedStart !== null)
      .sort((a, b) => (a.prediction.daysAway ?? 9999) - (b.prediction.daysAway ?? 9999))
      .slice(0, 8);

    // ── Active breedings, with a whelp forecast each ──
    const activeBreedings = breedings
      .map((b) => ({
        ...b,
        forecast: forecastWhelp(
          {
            ovulationDate: b.ovulationDate,
            lhSurgeDate: b.lhSurgeDate,
            breedingDates: b.events.map((e) => e.occurredOn),
          },
          now,
        ),
      }))
      .sort((a, b) => (a.forecast.daysAway ?? 9999) - (b.forecast.daysAway ?? 9999));

    // ── Litters ──
    const activeLitters = litters.map((l) => ({
      ...l,
      milestones: l.whelpedOn ? litterMilestones(l.whelpedOn, now) : null,
      available: l.puppies.filter((p) => p.status === 'AVAILABLE').length,
      reserved: l.puppies.filter((p) => p.status === 'RESERVED').length,
    }));

    const overdueTasks = dueTasks.filter((t) => t.dueOn < now);

    return {
      kennels: kennels.map((m) => ({ ...m.kennel, role: m.role })),
      counts: {
        dogs: dogs.length,
        females: dogs.filter((d) => d.sex === 'FEMALE').length,
        activeBreedings: activeBreedings.length,
        littersOnTheGround: litters.filter((l) => l.status === 'ON_THE_GROUND').length,
        puppiesOnTheGround: litters
          .filter((l) => l.status === 'ON_THE_GROUND')
          .reduce((n, l) => n + l.puppies.length, 0),
        overdueTasks: overdueTasks.length,
        openConflicts,
        verifiedClaims: dogs.reduce((n, d) => n + (d.verificationSummary?.verifiedCount ?? 0), 0),
      },
      upcomingHeats,
      activeBreedings,
      activeLitters,
      dueTasks,
    };
  });
}

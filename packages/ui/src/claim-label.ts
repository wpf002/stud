import { titleCase } from '@stud/ui';
/**
 * Turning a claim enum into something a person would say.
 *
 * Kept in its own module, with no 'use client' on it, because server
 * components label claims too — importing it from claim-panel.tsx put it on
 * the wrong side of the client boundary and threw at render time.
 */
const CLAIM_LABELS: Record<string, string> = {
  HIP: 'Hips', ELBOW: 'Elbows', PATELLA: 'Patellas', SHOULDER: 'Shoulders',
  LEGG_CALVE_PERTHES: 'Legg-Calve-Perthes', CARDIAC: 'Cardiac', EYE_CAER: 'Eyes (CAER)',
  THYROID: 'Thyroid', DENTITION: 'Dentition', TRACHEA: 'Trachea', HEARING_BAER: 'Hearing (BAER)',
  DNA_PANEL: 'Genetic Panel', DNA_MARKER: 'Genetic Marker', GENETIC_COI: 'Genetic COI',
  REGISTRATION: 'Registration', CHIC: 'CHIC', DNA_PROFILE: 'DNA Profile',
  TITLE_CONFORMATION: 'Conformation', TITLE_FIELD: 'Field Trial', TITLE_HUNT_TEST: 'Hunt Test',
  TITLE_OBEDIENCE: 'Obedience', TITLE_RALLY: 'Rally', TITLE_AGILITY: 'Agility',
  TITLE_TRACKING: 'Tracking', TITLE_HERDING: 'Herding', TITLE_WORKING: 'Working',
  TITLE_SERVICE: 'Service', TITLE_TEMPERAMENT: 'Good Citizen',
  TITLE_THERAPY: 'Therapy', TITLE_AWARD: 'Title',
  NAVHDA_NA: 'NAVHDA Natural Ability', NAVHDA_UT: 'NAVHDA Utility',
  NAVHDA_INVITATIONAL: 'NAVHDA Invitational',
};

export function claimLabel(claimType: string, markerName?: string | null): string {
  const base = CLAIM_LABELS[claimType] ?? titleCase(claimType);
  return markerName ? `${markerName}` : base;
}

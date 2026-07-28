/**
 * Pedigree import parsers.
 *
 * Three shapes of input, because that is what breeders actually have:
 *
 *   1. CSV — one row per dog, parents referenced by name or registration
 *      number. What comes out of a spreadsheet or a rival platform's export.
 *   2. Indented text — the hierarchical block you get from copying a pedigree
 *      off a registry page or an old pedigree-software printout.
 *   3. A single pasted line — "CH Blackwater's Storm SR12345601".
 *
 * Every parser returns rows plus *issues*. Nothing is silently dropped; an
 * import that quietly discards a great-grandparent is worse than one that
 * fails, because the COI it produces will look fine.
 *
 * Pure module. (Invariant 1.)
 */

export type ParsedSex = 'MALE' | 'FEMALE' | null;

export interface ParsedDog {
  /** Stable key within the import, used to wire up parent references. */
  key: string;
  registeredName?: string | null;
  callName?: string | null;
  registrationNumber?: string | null;
  registryBody?: string | null;
  sex: ParsedSex;
  breed?: string | null;
  dateOfBirth?: string | null;
  birthYear?: number | null;
  titlesPrefix?: string | null;
  titlesSuffix?: string | null;
  sireKey?: string | null;
  damKey?: string | null;
  /** Generations back from the subject. 0 = the dog being imported. */
  generation: number;
}

export interface ParseIssue {
  severity: 'error' | 'warning';
  line?: number;
  message: string;
}

export interface ParseResult {
  subjectKey: string | null;
  dogs: ParsedDog[];
  issues: ParseIssue[];
}

// ── Title and registration extraction ───────────────────────────────────────

/**
 * Common conformation, performance and hunting title tokens. Prefix titles
 * sit before the name; suffix titles after it.
 */
const PREFIX_TITLES = [
  'GCHP', 'GCHS', 'GCHG', 'GCHB', 'GCH', 'CH', 'BIS', 'BISS',
  'NFC', 'FC', 'AFC', 'NAFC', 'DC', 'TC', 'MACH', 'PACH', 'OTCH', 'HC',
  'NGDC', 'RBIS', 'SGCH',
];

const SUFFIX_TITLES = [
  'MH', 'SH', 'JH', 'NA', 'UT', 'VC', 'NAVHDA',
  'CD', 'CDX', 'UD', 'UDX', 'GO', 'GN', 'VER',
  'RN', 'RA', 'RE', 'RAE', 'RM', 'RACH',
  'NA', 'NAJ', 'OA', 'OAJ', 'AX', 'AXJ', 'MX', 'MXJ', 'MXB', 'MJB',
  'CGC', 'CGCA', 'CGCU', 'TKN', 'TKI', 'TKA', 'TKP',
  'BN', 'PCD', 'THD', 'FDC', 'SCN', 'SIN', 'SEN', 'SBN', 'SWN', 'SWA',
  'WC', 'WCX', 'WD', 'WDX', 'TD', 'TDX', 'VST', 'HIT',
  'ROM', 'ROMX', 'CHIC',
];

/**
 * Registration-number shapes we can recognise without guessing.
 * Deliberately conservative — a false positive here becomes a wrong
 * verification lookup in Phase 2.
 */
const REG_PATTERNS: { body: string; re: RegExp }[] = [
  // AKC: two letters + 8 digits, sometimes with a check letter.
  { body: 'AKC', re: /\b((?:S[A-Z]|H[PM]|D[LN]|N[PS]|T[RS]|R[NM]|W[SP])\d{8}(?:\/\d{2})?)\b/i },
  // UKC: P/R + 6-9 digits.
  { body: 'UKC', re: /\b([PR]\d{6,9})\b/ },
  // CKC (Canada): letters + 6-7 digits.
  { body: 'CKC', re: /\b([A-Z]{2}\d{6,7})\b/ },
  // NAVHDA test records.
  { body: 'NAVHDA', re: /\b(N[AU]-?\d{4}-?\d{3,5})\b/i },
];

export function extractRegistration(
  text: string,
): { number: string; body: string } | null {
  for (const { body, re } of REG_PATTERNS) {
    const m = re.exec(text);
    if (m?.[1]) return { number: m[1].toUpperCase(), body };
  }
  return null;
}

export interface ParsedName {
  registeredName: string;
  titlesPrefix: string | null;
  titlesSuffix: string | null;
  registrationNumber: string | null;
  registryBody: string | null;
}

/**
 * Split "GCH CH Blackwater's Ranger Of The Marsh MH NA SR91234501" into its
 * parts. Titles are kept separately: they are verifiable claims (Phase 2) and
 * must not be baked into the name field.
 */
export function parseDogLine(raw: string): ParsedName {
  let text = raw.trim().replace(/\s+/g, ' ');

  const reg = extractRegistration(text);
  if (reg) {
    text = text.replace(new RegExp(`\\b${escapeRegex(reg.number)}\\b`, 'i'), '').trim();
  }

  // Registration numbers are also often parenthesised or bracketed.
  text = text.replace(/[([{][^)\]}]*[)\]}]\s*$/, '').trim();

  const tokens = text.split(' ').filter(Boolean);

  const prefix: string[] = [];
  while (tokens.length > 1) {
    const t = tokens[0]!.replace(/[.,]$/, '').toUpperCase();
    if (!PREFIX_TITLES.includes(t)) break;
    prefix.push(tokens.shift()!.replace(/[.,]$/, ''));
  }

  const suffix: string[] = [];
  while (tokens.length > 1) {
    const t = tokens[tokens.length - 1]!.replace(/[.,]$/, '').toUpperCase();
    if (!SUFFIX_TITLES.includes(t)) break;
    suffix.unshift(tokens.pop()!.replace(/[.,]$/, ''));
  }

  return {
    registeredName: tokens.join(' ').replace(/[,\s]+$/, '').trim(),
    titlesPrefix: prefix.length ? prefix.join(' ') : null,
    titlesSuffix: suffix.length ? suffix.join(' ') : null,
    registrationNumber: reg?.number ?? null,
    registryBody: reg?.body ?? null,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Indented / hierarchical text ────────────────────────────────────────────

/**
 * Parse the block you get from copying a pedigree off a registry page:
 *
 *   Blackwater's Ranger Of The Marsh SR91234501
 *     Sire: CH Blackwater's Storm SR75110203
 *       Sire: FC Marshland Drake SR51002288
 *       Dam: Blackwater's Wren SR52883101
 *     Dam: Blackwater's Juniper Wind SR88451102
 *
 * Indentation gives the generation. `Sire:` / `Dam:` labels give the side;
 * where labels are missing, the first child at a level is taken as the sire
 * and the second as the dam, which is the near-universal convention.
 */
export function parseIndentedPedigree(input: string): ParseResult {
  const issues: ParseIssue[] = [];
  const rawLines = input.split(/\r?\n/);

  type Entry = { indent: number; text: string; side: 'S' | 'D' | null; line: number };
  const entries: Entry[] = [];

  rawLines.forEach((raw, i) => {
    if (!raw.trim()) return;
    // Tabs count as two spaces so mixed indentation still nests predictably.
    const expanded = raw.replace(/\t/g, '  ');
    const indent = expanded.length - expanded.trimStart().length;
    let text = expanded.trim();

    let side: 'S' | 'D' | null = null;
    const labelled = /^(sire|dam|s|d|father|mother)\s*[:.\-–]\s*(.+)$/i.exec(text);
    if (labelled) {
      const label = labelled[1]!.toLowerCase();
      side = label.startsWith('s') || label === 'father' ? 'S' : 'D';
      text = labelled[2]!.trim();
    }
    if (!text) return;
    entries.push({ indent, text, side, line: i + 1 });
  });

  if (entries.length === 0) {
    return { subjectKey: null, dogs: [], issues: [{ severity: 'error', message: 'Nothing to import — the text was empty.' }] };
  }

  // Normalise indentation to levels: distinct indents, ascending.
  const levels = [...new Set(entries.map((e) => e.indent))].sort((a, b) => a - b);
  const levelOf = (indent: number) => levels.indexOf(indent);

  const dogs: ParsedDog[] = [];
  const byKey = new Map<string, ParsedDog>();
  // Most recent dog seen at each level, so a child can find its parent.
  const stack: (ParsedDog | null)[] = [];
  let counter = 0;

  for (const entry of entries) {
    const level = levelOf(entry.indent);
    const parsed = parseDogLine(entry.text);

    if (!parsed.registeredName) {
      issues.push({ severity: 'warning', line: entry.line, message: `Could not read a name from "${entry.text}".` });
      continue;
    }

    const key = `p${counter++}`;
    const dog: ParsedDog = {
      key,
      registeredName: parsed.registeredName,
      registrationNumber: parsed.registrationNumber,
      registryBody: parsed.registryBody,
      titlesPrefix: parsed.titlesPrefix,
      titlesSuffix: parsed.titlesSuffix,
      sex: entry.side === 'S' ? 'MALE' : entry.side === 'D' ? 'FEMALE' : null,
      generation: level,
    };

    dogs.push(dog);
    byKey.set(key, dog);

    if (level > 0) {
      const parent = stack[level - 1];
      if (!parent) {
        issues.push({
          severity: 'warning',
          line: entry.line,
          message: `"${parsed.registeredName}" is indented under nothing — it was skipped.`,
        });
      } else if (entry.side === 'S' || (entry.side === null && !parent.sireKey)) {
        parent.sireKey = key;
        dog.sex ??= 'MALE';
      } else if (entry.side === 'D' || (entry.side === null && !parent.damKey)) {
        parent.damKey = key;
        dog.sex ??= 'FEMALE';
      } else {
        issues.push({
          severity: 'warning',
          line: entry.line,
          message: `"${parent.registeredName}" already has both parents; "${parsed.registeredName}" was skipped.`,
        });
      }
    }

    stack[level] = dog;
    stack.length = level + 1;
  }

  const subject = dogs.find((d) => d.generation === 0) ?? null;
  if (!subject) {
    issues.push({ severity: 'error', message: 'No top-level dog found — the first line should be the dog itself.' });
  }

  // A pedigree where nobody has a registration number will not verify.
  if (dogs.length > 1 && !dogs.some((d) => d.registrationNumber)) {
    issues.push({
      severity: 'warning',
      message:
        'No registration numbers were found. The pedigree will import, but none of it can be verified until numbers are added.',
    });
  }

  return { subjectKey: subject?.key ?? null, dogs, issues };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const CSV_ALIASES: Record<string, keyof ParsedDog | 'id'> = {
  id: 'id',
  key: 'id',
  dog_id: 'id',
  name: 'registeredName',
  registered_name: 'registeredName',
  registeredname: 'registeredName',
  full_name: 'registeredName',
  call_name: 'callName',
  callname: 'callName',
  sex: 'sex',
  gender: 'sex',
  breed: 'breed',
  dob: 'dateOfBirth',
  date_of_birth: 'dateOfBirth',
  birthdate: 'dateOfBirth',
  birth_date: 'dateOfBirth',
  reg: 'registrationNumber',
  registration: 'registrationNumber',
  registration_number: 'registrationNumber',
  reg_number: 'registrationNumber',
  akc: 'registrationNumber',
  registry: 'registryBody',
  sire: 'sireKey',
  sire_id: 'sireKey',
  father: 'sireKey',
  dam: 'damKey',
  dam_id: 'damKey',
  mother: 'damKey',
};

/** RFC 4180-ish splitter: handles quoted fields and embedded commas. */
export function splitCsvLine(line: string, delimiter = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Parse a relational CSV. Parent columns may hold either the `id` of another
 * row or a registered name; both are resolved after the whole file is read,
 * so forward references work.
 */
export function parseCsvPedigree(input: string, opts: { subjectId?: string } = {}): ParseResult {
  const issues: ParseIssue[] = [];
  const lines = input.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      subjectKey: null,
      dogs: [],
      issues: [{ severity: 'error', message: 'CSV needs a header row and at least one dog.' }],
    };
  }

  const delimiter = (lines[0]!.match(/\t/g)?.length ?? 0) > (lines[0]!.match(/,/g)?.length ?? 0) ? '\t' : ',';
  const header = splitCsvLine(lines[0]!, delimiter).map((h) =>
    h.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''),
  );

  const mapped = header.map((h) => CSV_ALIASES[h] ?? null);
  if (!mapped.includes('registeredName')) {
    issues.push({
      severity: 'error',
      message: `No name column found. Expected one of: name, registered_name, full_name. Got: ${header.join(', ')}.`,
    });
    return { subjectKey: null, dogs: [], issues };
  }

  type Row = { explicitId: string | null; dog: ParsedDog; rawSire: string | null; rawDam: string | null };
  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]!, delimiter);
    const dog: ParsedDog = { key: `c${i}`, sex: null, generation: 0 };
    let explicitId: string | null = null;
    let rawSire: string | null = null;
    let rawDam: string | null = null;

    mapped.forEach((field, col) => {
      const value = values[col]?.trim();
      if (!field || !value) return;
      switch (field) {
        case 'id':
          explicitId = value;
          break;
        case 'sireKey':
          rawSire = value;
          break;
        case 'damKey':
          rawDam = value;
          break;
        case 'sex': {
          const v = value.toLowerCase();
          dog.sex = v.startsWith('m') || v === '1' ? 'MALE' : v.startsWith('f') || v.startsWith('b') || v === '2' ? 'FEMALE' : null;
          break;
        }
        case 'dateOfBirth': {
          dog.dateOfBirth = value;
          const year = /(\d{4})/.exec(value)?.[1];
          if (year) dog.birthYear = Number(year);
          break;
        }
        case 'registeredName': {
          const parsed = parseDogLine(value);
          dog.registeredName = parsed.registeredName || value;
          dog.titlesPrefix ??= parsed.titlesPrefix;
          dog.titlesSuffix ??= parsed.titlesSuffix;
          dog.registrationNumber ??= parsed.registrationNumber;
          dog.registryBody ??= parsed.registryBody;
          break;
        }
        default:
          (dog as unknown as Record<string, unknown>)[field] = value;
      }
    });

    if (!dog.registeredName) {
      issues.push({ severity: 'warning', line: i + 1, message: 'Row has no name — skipped.' });
      continue;
    }
    rows.push({ explicitId, dog, rawSire, rawDam });
  }

  // Resolve parent references by explicit id first, then by name.
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const r of rows) {
    if (r.explicitId) byId.set(r.explicitId.toLowerCase(), r.dog.key);
    if (r.dog.registeredName) byName.set(normaliseName(r.dog.registeredName), r.dog.key);
  }

  /**
   * `null` means "no row matched — make a stub"; `rejected` means "we matched
   * and refused it", which must NOT then be resurrected as a stub ancestor.
   */
  const REJECTED = Symbol('rejected');
  const resolve = (
    ref: string | null,
    forRow: Row,
    side: 'sire' | 'dam',
  ): string | null | typeof REJECTED => {
    if (!ref) return null;
    const hit = byId.get(ref.toLowerCase()) ?? byName.get(normaliseName(parseDogLine(ref).registeredName || ref));
    if (!hit) {
      issues.push({
        severity: 'warning',
        message: `${forRow.dog.registeredName}: ${side} "${ref}" has no matching row. It will be created as a name-only ancestor.`,
      });
      return null;
    }
    if (hit === forRow.dog.key) {
      issues.push({
        severity: 'error',
        message: `${forRow.dog.registeredName} is listed as its own ${side}. That reference was dropped.`,
      });
      return REJECTED;
    }
    return hit;
  };

  const dogs = rows.map((r) => r.dog);
  const unresolved: ParsedDog[] = [];
  let stubCounter = 0;

  for (const r of rows) {
    const sireRef = resolve(r.rawSire, r, 'sire');
    const damRef = resolve(r.rawDam, r, 'dam');
    r.dog.sireKey = sireRef === REJECTED ? null : sireRef;
    r.dog.damKey = damRef === REJECTED ? null : damRef;

    // Named-but-absent parents become stub ancestors rather than vanishing.
    if (!r.dog.sireKey && sireRef !== REJECTED && r.rawSire) {
      const parsed = parseDogLine(r.rawSire);
      const stub: ParsedDog = {
        key: `s${stubCounter++}`,
        registeredName: parsed.registeredName || r.rawSire,
        registrationNumber: parsed.registrationNumber,
        registryBody: parsed.registryBody,
        titlesPrefix: parsed.titlesPrefix,
        titlesSuffix: parsed.titlesSuffix,
        sex: 'MALE',
        generation: 0,
      };
      unresolved.push(stub);
      r.dog.sireKey = stub.key;
    }
    if (!r.dog.damKey && damRef !== REJECTED && r.rawDam) {
      const parsed = parseDogLine(r.rawDam);
      const stub: ParsedDog = {
        key: `s${stubCounter++}`,
        registeredName: parsed.registeredName || r.rawDam,
        registrationNumber: parsed.registrationNumber,
        registryBody: parsed.registryBody,
        titlesPrefix: parsed.titlesPrefix,
        titlesSuffix: parsed.titlesSuffix,
        sex: 'FEMALE',
        generation: 0,
      };
      unresolved.push(stub);
      r.dog.damKey = stub.key;
    }
  }

  const all = [...dogs, ...unresolved];

  // Subject: the requested row, else the one nobody lists as a parent.
  const referenced = new Set(all.flatMap((d) => [d.sireKey, d.damKey]).filter(Boolean) as string[]);
  const roots = all.filter((d) => !referenced.has(d.key));
  const subject =
    (opts.subjectId ? all.find((d) => byId.get(opts.subjectId!.toLowerCase()) === d.key) : null) ??
    roots[0] ??
    all[0] ??
    null;

  if (roots.length > 1) {
    issues.push({
      severity: 'warning',
      message: `${roots.length} dogs are not listed as anyone's parent. "${subject?.registeredName}" was taken as the subject.`,
    });
  }

  if (subject) assignGenerations(all, subject.key);
  return { subjectKey: subject?.key ?? null, dogs: all, issues };
}

/** Breadth-first generation stamping from the subject. */
function assignGenerations(dogs: readonly ParsedDog[], subjectKey: string): void {
  const byKey = new Map(dogs.map((d) => [d.key, d]));
  for (const d of dogs) d.generation = -1;

  let frontier = [subjectKey];
  let gen = 0;
  const seen = new Set<string>();
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const key of frontier) {
      if (seen.has(key)) continue;
      seen.add(key);
      const dog = byKey.get(key);
      if (!dog) continue;
      if (dog.generation === -1) dog.generation = gen;
      if (dog.sireKey) next.push(dog.sireKey);
      if (dog.damKey) next.push(dog.damKey);
    }
    frontier = next;
    gen++;
  }
  // Anything unreachable from the subject sits at generation 0 alongside it.
  for (const d of dogs) if (d.generation === -1) d.generation = 0;
}

/** Casefold, strip punctuation and kennel-name noise for matching. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

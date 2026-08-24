#!/usr/bin/env python3
"""
Convert fixtures/stud-test-data.xlsx into fixtures/test-data.json.

Run:  python3 packages/db/scripts/xlsx-to-fixture.py

The importer (src/import-test-data.ts) reads the JSON, not the workbook, so
nothing in the app needs an xlsx parser. Re-run this only if the workbook
changes; the JSON is committed and is what actually seeds.

Two source-data problems are corrected here rather than in the importer,
because they are defects in the workbook rather than schema mapping:

  1. Titles are randomly assigned and, per the workbook's own Read Me, NOT
     breed-accurate — raw import puts NAVHDA versatile-hunting titles on
     Poodles. Discipline-restricted titles are dropped unless the breed's AKC
     group competes for them.
  2. BookingStatus carries "Booked through 2026-12-09" as prose. The date is
     parsed out into bookedThrough so it survives until there is a column for
     it (Phase 11); the app schema has nowhere to put it today.
"""
import json, re, sys, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'fixtures' / 'stud-test-data.xlsx'
OUT = ROOT / 'fixtures' / 'test-data.json'

# Titles any breed can earn: conformation, obedience, rally, citizenship,
# therapy. Everything else is discipline-restricted to an AKC group.
UNIVERSAL = {'CH', 'GCH', 'GRCH', 'CD', 'CDX', 'UD', 'RN', 'RA', 'RE',
             'MACH', 'CGC', 'CGCA', 'ThD', 'TDIA', 'TDIG'}
RESTRICTED = {
    'JH': {'Sporting'}, 'SH': {'Sporting'}, 'MH': {'Sporting'},
    'NA (NAVHDA)': {'Sporting'}, 'UT (NAVHDA)': {'Sporting'},
    'HT': {'Herding'}, 'PT': {'Herding'}, 'HS': {'Herding'},
}


def load(zf):
    shared = []
    if 'xl/sharedStrings.xml' in zf.namelist():
        for si in ET.fromstring(zf.read('xl/sharedStrings.xml')):
            shared.append(''.join(t.text or '' for t in si.iter(NS + 't')))

    wb = ET.fromstring(zf.read('xl/workbook.xml'))
    rels = {r.get('Id'): r.get('Target')
            for r in ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))}
    RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'

    sheets = {}
    for sh in wb.find(NS + 'sheets'):
        target = rels[sh.get(RID)].lstrip('/')
        if not target.startswith('xl/'):
            target = 'xl/' + target
        sheets[sh.get('name')] = read_sheet(zf.read(target), shared)
    return sheets


def col_index(ref):
    letters = ''.join(c for c in ref if c.isalpha())
    n = 0
    for c in letters:
        n = n * 26 + ord(c) - 64
    return n - 1


def read_sheet(xml, shared):
    out = []
    for row in ET.fromstring(xml).iter(NS + 'row'):
        cells = {}
        for c in row.iter(NS + 'c'):
            v, inline = c.find(NS + 'v'), c.find(NS + 'is')
            if c.get('t') == 'inlineStr' and inline is not None:
                val = ''.join(t.text or '' for t in inline.iter(NS + 't'))
            elif v is None:
                continue
            elif c.get('t') == 's':
                val = shared[int(v.text)]
            else:
                val = v.text
            if val is not None and str(val).strip() != '':
                cells[col_index(c.get('r'))] = str(val).strip()
        if cells:
            out.append([cells.get(i, '') for i in range(max(cells) + 1)])
    if not out:
        return []
    header = out[0]
    return [dict(zip(header, r + [''] * (len(header) - len(r)))) for r in out[1:]]


def num(v):
    if v in ('', None):
        return None
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def main():
    if not SRC.exists():
        sys.exit(f'missing {SRC}')
    sheets = load(zipfile.ZipFile(SRC))

    breeds = [{'breed': r['Breed'], 'group': r['AKC Group'],
               'rank': num(r.get('2025 Popularity Rank'))}
              for r in sheets['Breeds']]
    group_of = {b['breed']: b['group'] for b in breeds}

    dropped, kept = 0, 0
    dogs = []
    for r in sheets['Dogs']:
        group = group_of.get(r['Breed'])
        titles = []
        for raw in (r.get('Titles') or '').split(','):
            t = raw.strip()
            if not t:
                continue
            allowed = RESTRICTED.get(t)
            if allowed is not None and group not in allowed:
                dropped += 1
                continue
            if t not in UNIVERSAL and allowed is None:
                dropped += 1          # unknown title, do not invent meaning
                continue
            titles.append(t)
            kept += 1
        dogs.append({
            'dogId': r['DogID'], 'ownerType': r['OwnerType'], 'ownerId': r['OwnerID'],
            'name': r['DogName'], 'breed': r['Breed'], 'sex': r['Sex'],
            'dob': r.get('DOB') or None, 'role': r['Role'], 'titles': titles,
        })

    listings = []
    for r in sheets['StudListings']:
        status = r.get('BookingStatus') or ''
        m = re.search(r'(\d{4}-\d{2}-\d{2})', status)
        listings.append({
            'listingId': r['ListingID'], 'dogId': r['DogID'],
            'studOwnerId': r['StudOwnerID'], 'studFee': num(r.get('StudFee')),
            'bookingStatus': 'Booked' if status.startswith('Booked') else status,
            'bookedThrough': m.group(1) if m else None,
            'notes': r.get('Notes') or None,
        })

    data = {
        'generatedFrom': SRC.name,
        'referenceDate': '2026-08-20',
        'breeds': breeds,
        'breeders': [{
            'breederId': r['BreederID'], 'businessName': r['BusinessName'],
            'contactName': r['ContactName'], 'city': r['City'], 'state': r['State'],
            'primaryBreed': r['PrimaryBreed'],
            'yearsInBusiness': num(r.get('YearsInBusiness')),
            'registries': [x.strip() for x in (r.get('RegistryAffiliations') or '').split(',') if x.strip()],
            'credential': None if r.get('BreederCredential') in ('None listed', '') else r.get('BreederCredential'),
            'avgRating': num(r.get('AvgRating')), 'reviewCount': num(r.get('ReviewCount')),
            'stripeOnboarded': r.get('StripeOnboarded') == '1',
        } for r in sheets['Breeders']],
        'studOwners': [{
            'studOwnerId': r['StudOwnerID'], 'ownerName': r['OwnerName'],
            'city': r['City'], 'state': r['State'],
            'registries': [x.strip() for x in (r.get('RegistryAffiliations') or '').split(',') if x.strip()],
            'avgRating': num(r.get('AvgRating')), 'reviewCount': num(r.get('ReviewCount')),
            'stripeOnboarded': r.get('StripeOnboarded') == '1',
        } for r in sheets['StudOwners']],
        'dogs': dogs,
        'healthTests': [{
            'testId': r['TestID'], 'dogId': r['DogID'], 'testType': r['TestType'],
            'result': r['Result'], 'certifyingBody': r['CertifyingBody'],
            'testDate': r.get('TestDate') or None, 'expiryDate': r.get('ExpiryDate') or None,
        } for r in sheets['HealthTests']],
        'litters': [{
            'litterId': r['LitterID'], 'breederId': r['BreederID'], 'damDogId': r['DamDogID'],
            'breed': r['Breed'], 'sireName': r['SireName'], 'whelpDate': r.get('WhelpDate') or None,
            'puppiesTotal': num(r.get('PuppiesTotal')), 'puppiesAvailable': num(r.get('PuppiesAvailable')),
            'pricePerPuppy': num(r.get('PricePerPuppy')), 'status': r['Status'],
        } for r in sheets['Litters']],
        'studListings': listings,
        'reviews': [{
            'reviewId': r['ReviewID'], 'revieweeType': r['RevieweeType'],
            'revieweeId': r['RevieweeID'], 'reviewerName': r['ReviewerName'],
            'rating': num(r.get('Rating')), 'comment': r.get('Comment') or '',
            'transactionType': r['TransactionType'], 'reviewDate': r.get('ReviewDate') or None,
        } for r in sheets['Reviews']],
    }

    OUT.write_text(json.dumps(data, indent=2) + '\n')
    counts = {k: len(v) for k, v in data.items() if isinstance(v, list)}
    print('wrote', OUT.relative_to(ROOT.parents[1]))
    for k, v in counts.items():
        print(f'  {k:14} {v}')
    print(f'  titles kept={kept} dropped={dropped} (breed-inappropriate or unknown)')
    print(f'  bookedThrough parsed on {sum(1 for l in listings if l["bookedThrough"])} listings')


if __name__ == '__main__':
    main()

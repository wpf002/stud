import json, urllib.request, urllib.parse, time, re
UA={'User-Agent':'stud-dev-seed/0.1 (local dev fixture; educational use)'}
def get(url, tries=5):
    for a in range(tries):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30))
        except Exception as e:
            if '429' in str(e) or 'timed out' in str(e).lower():
                time.sleep(2.5*(a+1)); continue
            raise
    raise RuntimeError('gave up')

# A few breeds' AKC names differ from the Wikipedia article title.
ALIAS={'German Shepherd Dog':'German Shepherd','Bulldog':'Bulldog',
       'Poodle':'Poodle','Doberman Pinscher':'Dobermann',
       'Chihuahua':'Chihuahua (dog breed)','Havanese':'Havanese dog',
       'Miniature American Shepherd':'Miniature American Shepherd',
       'Pembroke Welsh Corgi':'Pembroke Welsh Corgi'}

breeds=[b['breed'] for b in json.load(open('packages/db/fixtures/test-data.json'))['breeds']]
out={}
for i,b in enumerate(breeds,1):
    title=ALIAS.get(b,b).replace(' ','_')
    try:
        s=get('https://en.wikipedia.org/api/rest_v1/page/summary/'+urllib.parse.quote(title))
    except Exception as e:
        print(f'{i:2}. {b:32} SUMMARY FAIL {e}', flush=True); time.sleep(1.5); continue
    img=(s.get('originalimage') or {}).get('source') or (s.get('thumbnail') or {}).get('source')
    if not img:
        print(f'{i:2}. {b:32} NO IMAGE', flush=True); time.sleep(1.2); continue
    clean=img.split('?')[0]
    fname=urllib.parse.unquote(clean.split('/')[-1])
    lic=artist=''
    try:
        meta=get('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url&iiurlwidth=1200&titles='+urllib.parse.quote('File:'+fname))
        for _,pg in (meta['query']['pages']).items():
            ii=(pg.get('imageinfo') or [{}])[0]
            em=ii.get('extmetadata',{})
            lic=(em.get('LicenseShortName',{}) or {}).get('value') or ''
            artist=re.sub(r'<[^>]+>','',(em.get('Artist',{}) or {}).get('value') or '').strip()[:70]
            if ii.get('thumburl'): clean=ii['thumburl']
    except Exception:
        pass
    out[b]={'breed':b,'wiki':s.get('title'),'url':clean,'file':fname,'license':lic,'artist':artist}
    print(f"{i:2}. {b:32} {s.get('title')[:26]:28} {lic[:16]}", flush=True)
    time.sleep(1.2)
json.dump(out, open('/tmp/breed-photos.json','w'), indent=2)
print(f'\nresolved {len(out)}/{len(breeds)}')

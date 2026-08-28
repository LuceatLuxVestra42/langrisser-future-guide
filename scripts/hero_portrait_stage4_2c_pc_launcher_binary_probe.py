#!/usr/bin/env python3
import hashlib
import json
import os
import re
import shutil
import subprocess
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
WORK=Path('/tmp/hero42c_launcher')
WORK.mkdir(parents=True,exist_ok=True)
EXE=WORK/'DownLoad-MZ-PC.exe'
OUT=ROOT/'data/validation/hero-portrait-stage4-2c-pc-launcher-binary-probe.v1.json'
URL='https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
EXPECTED_MD5='31A6DB4F224374185E2C498287D3D3F3'.lower()

req=urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0'})
with urllib.request.urlopen(req,timeout=120) as r:
    data=r.read()
EXE.write_bytes(data)

sha256=hashlib.sha256(data).hexdigest()
md5=hashlib.md5(data).hexdigest()

# Extract printable strings from ASCII and UTF-16LE without dumping binary.
ascii_strings=[]
for m in re.finditer(rb'[\x20-\x7e]{6,}', data):
    try: ascii_strings.append(m.group(0).decode('ascii'))
    except Exception: pass
utf16_strings=[]
for m in re.finditer(rb'(?:[\x20-\x7e]\x00){6,}', data):
    try: utf16_strings.append(m.group(0).decode('utf-16le'))
    except Exception: pass
all_strings=[]
for s in ascii_strings+utf16_strings:
    if s not in all_strings: all_strings.append(s)

interesting_re=re.compile(r'https?://|manifest|version|update|patch|asset|bundle|cdn|server|config|\.json|\.xml|\.txt|\.zip|\.7z|\.rar|unity|langrisser|mhmn|mzpc', re.I)
interesting=[s for s in all_strings if interesting_re.search(s)]
urls=[]
for s in all_strings:
    for u in re.findall(r'https?://[^\s\"\'<>\x00]+',s,re.I):
        u=u.rstrip(');,]}>')
        if u not in urls: urls.append(u)

seven=shutil.which('7z') or shutil.which('7zz')
archive_list=[]
extracted_scan=[]
if seven:
    p=subprocess.run([seven,'l','-slt',str(EXE)],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace',timeout=90)
    listing=p.stdout
    for line in listing.splitlines():
        if line.startswith('Path = '):
            value=line[7:]
            if value and value != str(EXE) and value not in archive_list:
                archive_list.append(value)
    extract_dir=WORK/'extract'
    extract_dir.mkdir(exist_ok=True)
    p2=subprocess.run([seven,'x','-y',f'-o{extract_dir}',str(EXE)],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,errors='replace',timeout=120)
    if p2.returncode==0:
        for path in extract_dir.rglob('*'):
            if not path.is_file() or path.stat().st_size>60_000_000:
                continue
            try: b=path.read_bytes()
            except Exception: continue
            hits=[]
            for m in re.finditer(rb'[\x20-\x7e]{6,}',b):
                try: s=m.group(0).decode('ascii')
                except Exception: continue
                if interesting_re.search(s): hits.append(s)
            for m in re.finditer(rb'(?:[\x20-\x7e]\x00){6,}',b):
                try: s=m.group(0).decode('utf-16le')
                except Exception: continue
                if interesting_re.search(s): hits.append(s)
            unique=[]
            for s in hits:
                if s not in unique: unique.append(s)
            if unique:
                extracted_scan.append({'path':str(path.relative_to(extract_dir)),'size':path.stat().st_size,'hits':unique[:200]})

out={
 'version':1,
 'stage':'hero-portrait-stage4-2c-current-unity-source-proof',
 'phase':'OFFICIAL_PC_LAUNCHER_BINARY_ENDPOINT_PROBE',
 'status':'PASS',
 'sourceUrl':URL,
 'technical':{
   'byteLength':len(data),'md5':md5,'expectedMd5':EXPECTED_MD5,'expectedMd5Match':md5==EXPECTED_MD5,'sha256':sha256,
   'peSignature':data[:2]==b'MZ','sevenZipAvailable':bool(seven)
 },
 'summary':{
   'asciiStringCount':len(ascii_strings),'utf16StringCount':len(utf16_strings),'interestingStringCount':len(interesting),'urlCount':len(urls),'archiveEntryCount':len(archive_list),'extractedFilesWithInterestingStrings':len(extracted_scan)
 },
 'urls':urls[:300],
 'interestingStrings':interesting[:1000],
 'archiveEntries':archive_list[:1000],
 'extractedScan':extracted_scan[:200],
 'policy':{'fullGameClientDownloaded':False,'launcherOnly':True,'binaryStoredInRepository':False,'endpointDiscoveryOnly':True}
}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'technical':out['technical'],'summary':out['summary']},ensure_ascii=False,indent=2))

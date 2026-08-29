import pathlib

source_path = pathlib.Path('scripts/probe-hero-artwork-family-texture-rule.py')
source = source_path.read_text(encoding='utf-8')
old = '''def parse_manifest(text):
    package = None
    rows = []
    for raw in text.splitlines():
        line = raw.strip()
        m = re.fullmatch(r'\\[Package(\\d+)\\]', line, re.I)
        if m:
            package = int(m.group(1))
            continue
        if package is None or not re.match(r'^File\\d+=', line, re.I):
            continue
        value = line.split('=', 1)[1]
        parts = value.rsplit(',', 3)
        if len(parts) != 4:
            continue
        path, flag, size, md5 = parts
        rows.append({
            'packageIndex': package,
            'path': path.replace('\\\\', '/'),
            'flag': flag,
            'bytes': int(size),
            'md5': md5.upper(),
        })
    return rows
'''
new = '''def parse_manifest(text):
    package = None
    rows = []
    for raw in text.splitlines():
        line = raw.strip()
        m = re.fullmatch(r'\\[Package(\\d+)\\]', line, re.I)
        if m:
            package = int(m.group(1))
            continue
        if package is None or not re.match(r'^File\\d+=', line, re.I):
            continue
        value = line.split('=', 1)[1]
        parts = [p.strip() for p in value.split(',')]
        if len(parts) < 3:
            continue
        path = parts[0].replace('\\\\', '/')
        md5_index = None
        for i, token in enumerate(parts[1:], 1):
            if re.fullmatch(r'[0-9A-Fa-f]{32}', token):
                md5_index = i
                break
        if md5_index is None:
            continue
        numeric = [int(token) for token in parts[1:md5_index] if token.isdigit()]
        if not numeric:
            continue
        rows.append({
            'packageIndex': package,
            'path': path,
            'flag': parts[1] if len(parts) > 1 else None,
            'bytes': numeric[-1],
            'md5': parts[md5_index].upper(),
            'rawManifestLine': line,
        })
    return rows
'''
if old not in source:
    raise RuntimeError('expected parse_manifest implementation not found; refusing blind patch')
patched = source.replace(old, new, 1)
exec(compile(patched, str(source_path) + ':v2', 'exec'), {'__name__': '__main__'})

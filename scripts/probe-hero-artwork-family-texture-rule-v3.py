import pathlib

source_path = pathlib.Path('scripts/probe-hero-artwork-family-texture-rule.py')
source = source_path.read_text(encoding='utf-8')

old_parser = '''def parse_manifest(text):
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
new_parser = '''def parse_manifest(text):
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
if old_parser not in source:
    raise RuntimeError('expected parse_manifest implementation not found')
source = source.replace(old_parser, new_parser, 1)

old_reps = "representatives = [sorted(v, key=lambda h: h['heroId'])[0] for _, v in sorted(families.items())]\n"
new_reps = "representatives = []  # selected after exact current-bundle containment is known\n"
if old_reps not in source:
    raise RuntimeError('expected representative selection not found')
source = source.replace(old_reps, new_reps, 1)

old_loop = '''results = []
for rep in representatives:
    bundle_name = bundle_name_for_family(rep['family'])
    hits = manifest_by_bundle.get(bundle_name.lower(), [])
    if len(hits) != 1:
        raise RuntimeError(f'{bundle_name}: manifest hit count {len(hits)}')
    m = hits[0]
    package_index = m['packageIndex']
    package_name = f'InstallPage_{VERSION}_{package_index + 1}.zip'
    package_url = f'{BASE}/{package_name}'
    package_bytes = head_size(package_url)
    if bundle_name not in bundle_cache:
        bundle_cache[bundle_name] = extract_bundle(
            package_url, package_bytes, package_index, bundle_name, m['bytes'], m['md5'], zip_cache
        )
    bundle_bytes, provenance = bundle_cache[bundle_name]
    validation = validate_prefab(bundle_bytes, rep['sourceAssetPath'])
    row = {
        **rep,
        'familyHeroCount': len(families[rep['family']]),
        'bundleProvenance': provenance,
        'textureRuleValidation': validation,
        'status': 'PASS' if validation['rulePass'] else 'FAIL',
    }
    results.append(row)
'''
new_loop = '''results = []
for family in sorted(families):
    bundle_name = bundle_name_for_family(family)
    hits = manifest_by_bundle.get(bundle_name.lower(), [])
    if len(hits) != 1:
        raise RuntimeError(f'{bundle_name}: manifest hit count {len(hits)}')
    m = hits[0]
    package_index = m['packageIndex']
    package_name = f'InstallPage_{VERSION}_{package_index + 1}.zip'
    package_url = f'{BASE}/{package_name}'
    package_bytes = head_size(package_url)
    if bundle_name not in bundle_cache:
        bundle_cache[bundle_name] = extract_bundle(
            package_url, package_bytes, package_index, bundle_name, m['bytes'], m['md5'], zip_cache
        )
    bundle_bytes, provenance = bundle_cache[bundle_name]

    probe_env = UnityPy.load(bundle_bytes)
    available = {norm(path) for path in probe_env.container.keys()}
    candidates = sorted(families[family], key=lambda h: h['heroId'])
    rep = next((h for h in candidates if ('assets/gameproject/runtimeassets/' + norm(h['sourceAssetPath'])) in available), None)
    if rep is None:
        raise RuntimeError(f'{family}: no canonical Hero prefab found in current authoritative bundle {bundle_name}')

    validation = validate_prefab(bundle_bytes, rep['sourceAssetPath'])
    row = {
        **rep,
        'familyHeroCount': len(families[family]),
        'bundleContainedHeroCount': sum(1 for h in candidates if ('assets/gameproject/runtimeassets/' + norm(h['sourceAssetPath'])) in available),
        'bundleProvenance': provenance,
        'textureRuleValidation': validation,
        'status': 'PASS' if validation['rulePass'] else 'FAIL',
    }
    results.append(row)
'''
if old_loop not in source:
    raise RuntimeError('expected validation loop not found')
source = source.replace(old_loop, new_loop, 1)
source = source.replace(
    "'representativeSelectionRule': 'lowest heroId in each exact /Prefab family',",
    "'representativeSelectionRule': 'lowest heroId whose exact canonical prefab exists in the current authoritative family bundle',",
    1,
)
exec(compile(source, str(source_path) + ':v3', 'exec'), {'__name__': '__main__'})

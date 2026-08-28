import fs from 'node:fs';

const MAP_PATH = process.argv[2] ?? 'data/contracts/project-doctor-d2-dependency-map.v1.json';
const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

const failures = [];
const check = (name, condition, detail = null) => {
  if (!condition) failures.push({ name, detail });
};

const escapeRegex = value => value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
const globToRegex = glob => {
  let out = '^';
  for (let i = 0; i < glob.length;) {
    if (glob.slice(i, i + 2) === '**') {
      out += '.*';
      i += 2;
    } else if (glob[i] === '*') {
      out += '[^/]*';
      i += 1;
    } else if (glob[i] === '?') {
      out += '[^/]';
      i += 1;
    } else {
      out += escapeRegex(glob[i]);
      i += 1;
    }
  }
  return new RegExp(`${out}$`);
};

const matches = (path, rule) => {
  const included = (rule.patterns ?? []).some(pattern => globToRegex(pattern).test(path));
  const excluded = (rule.excludePatterns ?? []).some(pattern => globToRegex(pattern).test(path));
  return included && !excluded;
};

const allNodeNames = new Set(Object.keys(map.impactNodes ?? {}));
const allDomains = new Set(map.doctorDomains ?? []);

check('status DESIGN_FROZEN', map.status === 'DESIGN_FROZEN', map.status);
check('six Doctor domains', allDomains.size === 6, [...allDomains]);
check('unmatched path manual review', map.mappingPolicy?.unmatchedPath === 'MANUAL_REVIEW');
check('unmatched ConfigData manual review', map.mappingPolicy?.unmatchedConfigData === 'MANUAL_REVIEW');

for (const [node, spec] of Object.entries(map.impactNodes ?? {})) {
  check(`node class ${node}`, typeof spec.class === 'string' && spec.class.length > 0, spec);
  for (const domain of spec.domains ?? []) {
    check(`node domain ${node}/${domain}`, allDomains.has(domain), spec.domains);
  }
}

const edgeKeys = new Set();
for (const edge of map.propagationEdges ?? []) {
  check(`edge from ${edge.from}`, allNodeNames.has(edge.from), edge);
  check(`edge to ${edge.to}`, allNodeNames.has(edge.to), edge);
  const key = `${edge.from}->${edge.to}`;
  check(`edge unique ${key}`, !edgeKeys.has(key), edge);
  edgeKeys.add(key);
}

const visit = (node, stack, visited) => {
  if (stack.has(node)) return false;
  if (visited.has(node)) return true;
  stack.add(node);
  for (const edge of map.propagationEdges ?? []) {
    if (edge.from === node && !visit(edge.to, stack, visited)) return false;
  }
  stack.delete(node);
  visited.add(node);
  return true;
};
for (const node of allNodeNames) {
  check(`acyclic propagation at ${node}`, visit(node, new Set(), new Set()));
}

const ruleIds = new Set();
for (const rule of map.pathRules ?? []) {
  check(`rule id ${rule.id}`, typeof rule.id === 'string' && rule.id.length > 0);
  check(`rule id unique ${rule.id}`, !ruleIds.has(rule.id), rule.id);
  ruleIds.add(rule.id);
  check(`rule patterns ${rule.id}`, Array.isArray(rule.patterns) && rule.patterns.length > 0, rule.patterns);
  check(`rule direct nodes ${rule.id}`, Array.isArray(rule.directNodes) && rule.directNodes.length > 0, rule.directNodes);
  for (const node of rule.directNodes ?? []) check(`rule node ${rule.id}/${node}`, allNodeNames.has(node), rule);
  for (const pattern of rule.patterns ?? []) {
    if (pattern.startsWith('data/configdata/')) {
      check(`ConfigData rule exact ${rule.id}`, !pattern.includes('*') && !pattern.includes('?'), pattern);
    }
  }
}

const resolvePath = path => {
  const directNodes = [];
  const matchedRules = [];
  for (const rule of map.pathRules ?? []) {
    if (!matches(path, rule)) continue;
    matchedRules.push(rule.id);
    for (const node of rule.directNodes ?? []) if (!directNodes.includes(node)) directNodes.push(node);
  }

  const nodes = [...directNodes];
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of map.propagationEdges ?? []) {
      if (nodes.includes(edge.from) && !nodes.includes(edge.to)) {
        nodes.push(edge.to);
        changed = true;
      }
    }
  }

  const domains = [];
  for (const node of nodes) {
    for (const domain of map.impactNodes[node]?.domains ?? []) {
      if (!domains.includes(domain)) domains.push(domain);
    }
  }

  return {
    path,
    matchedRules,
    directNodes,
    propagatedNodes: nodes.filter(node => !directNodes.includes(node)),
    domains,
    unmatched: directNodes.length === 0 ? 'MANUAL_REVIEW' : null,
  };
};

const fixtureResults = [];
for (const fixture of map.fixtures ?? []) {
  const actual = resolvePath(fixture.path);
  const directPass = JSON.stringify(actual.directNodes) === JSON.stringify(fixture.expectedDirectNodes ?? []);
  const domainPass = JSON.stringify(actual.domains) === JSON.stringify(fixture.expectedDomains ?? []);
  const unmatchedPass = fixture.expectedUnmatched === undefined || actual.unmatched === fixture.expectedUnmatched;
  const pass = directPass && domainPass && unmatchedPass;
  fixtureResults.push({ path: fixture.path, pass, actual, expected: fixture });
  check(`fixture ${fixture.path}`, pass, fixtureResults.at(-1));
}

const unknownConfig = resolvePath('data/configdata/ConfigDataUnknownFutureTable.json');
check('unknown ConfigData is not guessed', unknownConfig.directNodes.length === 0 && unknownConfig.unmatched === 'MANUAL_REVIEW', unknownConfig);

const summary = {
  status: failures.length === 0 ? 'PASS_PROJECT_DOCTOR_D2_DEPENDENCY_MAP' : 'FAIL_PROJECT_DOCTOR_D2_DEPENDENCY_MAP',
  nodeCount: allNodeNames.size,
  pathRuleCount: (map.pathRules ?? []).length,
  propagationEdgeCount: (map.propagationEdges ?? []).length,
  fixtureCount: fixtureResults.length,
  fixturePassCount: fixtureResults.filter(item => item.pass).length,
  fixtureFailureCount: fixtureResults.filter(item => !item.pass).length,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) process.exitCode = 1;

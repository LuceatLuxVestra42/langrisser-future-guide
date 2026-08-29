import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const contractPath = path.join(root, "data/contracts/route-hosted-qa-stage0.v1.json");
const validationPath = path.join(root, "data/validation/route-hosted-qa-stage0.v1.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unique(values) {
  return new Set(values).size === values.length;
}

function routeTreeContains(routeTree, route) {
  return routeTree.includes(`'${route}'`) || routeTree.includes(`\"${route}\"`);
}

function recordIds(source, field) {
  if (!Array.isArray(source.records)) return new Set();
  return new Set(source.records.map((record) => record?.[field]).filter(Number.isSafeInteger));
}

const contract = readJson(contractPath);
const routeTree = fs.readFileSync(path.join(root, contract.baseline.routeTree), "utf8");
const heroSource = readJson(path.join(root, contract.baseline.heroFixtureSource));
const soldierSource = readJson(path.join(root, contract.baseline.soldierFixtureSource));
const equipmentSource = readJson(path.join(root, contract.baseline.equipmentFixtureSource));

const heroIds = recordIds(heroSource, "heroId");
const soldierIds = recordIds(soldierSource, "soldierId");
const equipmentIds = recordIds(equipmentSource, "equipmentId");

const checks = [];
function check(id, pass, details) {
  checks.push({ id, pass: Boolean(pass), details });
}

check(
  "contract-identity",
  contract.schemaVersion === "route-hosted-qa-stage0.v1" &&
    contract.stage === "QA-0" &&
    contract.status === "DESIGN_FROZEN",
  {
    schemaVersion: contract.schemaVersion,
    stage: contract.stage,
    status: contract.status,
  },
);

check(
  "required-public-routes-present",
  unique(contract.requiredPublicRoutes) && contract.requiredPublicRoutes.every((route) => routeTreeContains(routeTree, route)),
  {
    count: contract.requiredPublicRoutes.length,
    routes: contract.requiredPublicRoutes,
  },
);

check(
  "detail-route-patterns-present",
  unique(contract.requiredDetailRoutePatterns) &&
    contract.requiredDetailRoutePatterns.every((route) => routeTreeContains(routeTree, route)),
  {
    count: contract.requiredDetailRoutePatterns.length,
    routes: contract.requiredDetailRoutePatterns,
  },
);

const prototypeRoutes = contract.excludedFromRequiredPublicGate.map((entry) => entry.route);
check(
  "prototype-routes-explicitly-excluded",
  unique(prototypeRoutes) &&
    prototypeRoutes.every((route) => routeTreeContains(routeTree, route)) &&
    prototypeRoutes.every((route) => !contract.requiredPublicRoutes.includes(route)),
  {
    count: prototypeRoutes.length,
    routes: prototypeRoutes,
  },
);

check(
  "hero-fixtures-resolve",
  contract.representativeFixtures.heroes.every((id) => heroIds.has(id)),
  {
    fixtures: contract.representativeFixtures.heroes,
    sourceRecordCount: heroIds.size,
  },
);

check(
  "soldier-fixtures-resolve",
  contract.representativeFixtures.soldiers.every((id) => soldierIds.has(id)),
  {
    fixtures: contract.representativeFixtures.soldiers,
    sourceRecordCount: soldierIds.size,
  },
);

check(
  "equipment-fixtures-resolve",
  contract.representativeFixtures.equipment.every((id) => equipmentIds.has(id)),
  {
    fixtures: contract.representativeFixtures.equipment,
    sourceRecordCount: equipmentIds.size,
  },
);

const expectedBaseUrl = `${contract.hostedTarget.origin}${contract.hostedTarget.repositoryBase}`;
check(
  "repository-base-contract",
  contract.hostedTarget.origin.startsWith("https://") &&
    !contract.hostedTarget.origin.endsWith("/") &&
    contract.hostedTarget.repositoryBase.startsWith("/") &&
    contract.hostedTarget.repositoryBase.endsWith("/") &&
    contract.hostedTarget.baseUrl === expectedBaseUrl &&
    contract.hostedTarget.canonicalDirectoryStyle === "TRAILING_SLASH",
  contract.hostedTarget,
);

const requiredHostedChecks = [
  "DEPLOYED_COMMIT_FRESHNESS",
  "REPOSITORY_BASE_PATH",
  "PUBLIC_ROUTE_RESOLUTION",
  "DETAIL_DIRECT_ENTRY",
  "REFRESH_EQUIVALENT_GET",
  "TRAILING_SLASH_POLICY",
  "ASSET_AND_CHUNK_RESOLUTION",
  "FILENAME_CASE_SENSITIVITY",
  "ROUTE_TREE_HOSTED_PARITY",
  "STALE_DEPLOY_OR_CACHE",
];
check(
  "hosted-gate-scope-complete",
  unique(contract.hostedGateChecks) && requiredHostedChecks.every((id) => contract.hostedGateChecks.includes(id)),
  {
    count: contract.hostedGateChecks.length,
    checks: contract.hostedGateChecks,
  },
);

check(
  "failure-boundary-separated",
  contract.failureClassification.hosted === "DEPLOYMENT_HOSTING_FAIL" &&
    contract.failureClassification.browser === "BROWSER_UI_FAIL" &&
    contract.failureClassification.semanticReopenAllowed === false,
  contract.failureClassification,
);

const failed = checks.filter((entry) => !entry.pass);
const result = {
  stage: "QA-0",
  schemaVersion: "route-hosted-qa-stage0-validation.v1",
  contractVersion: contract.schemaVersion,
  status: failed.length === 0 ? "PASS" : "FAIL",
  baseline: {
    mainCommit: contract.baseline.mainCommit,
    routeTree: contract.baseline.routeTree,
    repositoryBase: contract.hostedTarget.repositoryBase,
  },
  summary: {
    checks: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    requiredPublicRoutes: contract.requiredPublicRoutes.length,
    detailRoutePatterns: contract.requiredDetailRoutePatterns.length,
    heroFixtures: contract.representativeFixtures.heroes.length,
    soldierFixtures: contract.representativeFixtures.soldiers.length,
    equipmentFixtures: contract.representativeFixtures.equipment.length,
  },
  checks,
};

const serialized = `${JSON.stringify(result, null, 2)}\n`;
const args = new Set(process.argv.slice(2));

if (args.has("--write")) {
  fs.mkdirSync(path.dirname(validationPath), { recursive: true });
  fs.writeFileSync(validationPath, serialized);
}

if (args.has("--check")) {
  if (!fs.existsSync(validationPath)) {
    console.error(`Missing frozen validation artifact: ${path.relative(root, validationPath)}`);
    process.exit(1);
  }
  const frozen = fs.readFileSync(validationPath, "utf8");
  if (frozen !== serialized) {
    console.error("Route/Hosted QA Stage 0 validation artifact is stale or mismatched.");
    process.exit(1);
  }
}

process.stdout.write(serialized);
process.exit(failed.length === 0 ? 0 : 1);

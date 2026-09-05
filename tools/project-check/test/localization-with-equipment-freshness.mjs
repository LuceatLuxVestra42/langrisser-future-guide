import { spawnSync } from "node:child_process";

function run(executable, args, label) {
  const result = spawnSync(executable, args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(`[localization-project-check] FAIL ${label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[localization-project-check] FAIL ${label}: exit ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

run("npm", ["run", "audit:localization:check"], "localization-audit");
run(
  process.execPath,
  ["tools/project-check/test/equipment-name-presentation-freshness.mjs"],
  "equipment-name-presentation-freshness",
);
run(
  process.execPath,
  ["scripts/audit-localization-effect-descriptions.mjs"],
  "equipment-effect-description-presentation",
);

console.log("[localization-project-check] PASS");

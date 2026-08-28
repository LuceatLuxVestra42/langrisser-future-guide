import fs from "node:fs";

const TARGETS = [
  { path: "src/routes/equipment.tsx", expected: 2 },
  { path: "src/routes/equipment_.exclusive.tsx", expected: 2 },
  { path: "src/routes/equipment_.$equipmentId.tsx", expected: 6 },
];

for (const target of TARGETS) {
  const source = fs.readFileSync(target.path, "utf8");
  let replacements = 0;
  const patched = source.replace(/<Link\n(\s+)to="(\/equipment[^"]*)"/g, (match, indent, to) => {
    replacements += 1;
    return `<Link\n${indent}reloadDocument\n${indent}to="${to}"`;
  });

  const alreadyPatched = (source.match(/<Link\n\s+reloadDocument\n\s+to="\/equipment[^"]*"/g) ?? []).length;
  const totalCovered = replacements + alreadyPatched;
  if (totalCovered !== target.expected) {
    throw new Error(`${target.path}: expected ${target.expected} Equipment document-navigation links, found ${totalCovered}`);
  }

  if (replacements > 0) {
    fs.writeFileSync(target.path, patched);
  }

  console.log(`${target.path}: ${replacements} added, ${alreadyPatched} already present`);
}

console.log("PASS: Equipment routes use reloadDocument for all cross-page Equipment navigation links.");

import fs from "node:fs";

const TARGETS = [
  { path: "src/routes/equipment.tsx", expected: 2 },
  { path: "src/routes/equipment_.exclusive.tsx", expected: 2 },
  { path: "src/routes/equipment_.$equipmentId.tsx", expected: 6 },
];

for (const target of TARGETS) {
  const source = fs.readFileSync(target.path, "utf8");
  let equipmentLinks = 0;
  let replacements = 0;
  let alreadyPatched = 0;

  const patched = source.replace(/<Link\b[\s\S]*?>/g, (openingTag) => {
    if (!/\bto="\/equipment[^"]*"/.test(openingTag)) return openingTag;

    equipmentLinks += 1;
    if (/\breloadDocument\b/.test(openingTag)) {
      alreadyPatched += 1;
      return openingTag;
    }

    const indentMatch = openingTag.match(/^<Link\n(\s+)/);
    if (!indentMatch) {
      throw new Error(`${target.path}: unsupported Equipment Link formatting: ${openingTag}`);
    }

    replacements += 1;
    const indent = indentMatch[1];
    return openingTag.replace(/^<Link\n(\s+)/, `<Link\n${indent}reloadDocument\n${indent}`);
  });

  if (equipmentLinks !== target.expected) {
    throw new Error(`${target.path}: expected ${target.expected} Equipment document-navigation links, found ${equipmentLinks}`);
  }

  if (replacements > 0) {
    fs.writeFileSync(target.path, patched);
  }

  console.log(`${target.path}: ${replacements} added, ${alreadyPatched} already present, ${equipmentLinks} covered`);
}

console.log("PASS: Equipment routes use reloadDocument for all cross-page Equipment navigation links.");

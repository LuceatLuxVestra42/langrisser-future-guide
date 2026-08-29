import fs from "node:fs";

const TARGETS = [
  {
    path: "src/routes/heroes.tsx",
    expected: 1,
    matches: (openingTag) => /\bto="\/heroes\/\$heroId"/.test(openingTag),
  },
  {
    path: "src/routes/heroes_.$heroId.tsx",
    expected: 2,
    matches: (openingTag) => /\bto="\/heroes"/.test(openingTag),
  },
];

for (const target of TARGETS) {
  const source = fs.readFileSync(target.path, "utf8");
  let heroLinks = 0;
  let replacements = 0;
  let alreadyPatched = 0;

  const patched = source.replace(/<Link\b[\s\S]*?>/g, (openingTag) => {
    if (!target.matches(openingTag)) return openingTag;

    heroLinks += 1;
    if (/\breloadDocument\b/.test(openingTag)) {
      alreadyPatched += 1;
      return openingTag;
    }

    replacements += 1;
    const indentMatch = openingTag.match(/^<Link\n(\s+)/);
    if (indentMatch) {
      const indent = indentMatch[1];
      return openingTag.replace(/^<Link\n(\s+)/, `<Link\n${indent}reloadDocument\n${indent}`);
    }

    if (/^<Link\s+/.test(openingTag)) {
      return openingTag.replace(/^<Link\s+/, "<Link reloadDocument ");
    }

    throw new Error(`${target.path}: unsupported Hero Link formatting: ${openingTag}`);
  });

  if (heroLinks !== target.expected) {
    throw new Error(`${target.path}: expected ${target.expected} Hero document-navigation links, found ${heroLinks}`);
  }

  if (replacements > 0) fs.writeFileSync(target.path, patched);
  console.log(`${target.path}: ${replacements} added, ${alreadyPatched} already present, ${heroLinks} covered`);
}

console.log("PASS: Hero list/detail cross-page links use reloadDocument for GitHub Pages static navigation.");

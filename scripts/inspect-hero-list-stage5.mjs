import { readFileSync } from "node:fs";

const ids = [1, 4, 28];

function keys(value) {
  if (Array.isArray(value)) return [`ARRAY(${value.length})`, ...keys(value[0])];
  if (!value || typeof value !== "object") return [typeof value];
  return Object.keys(value);
}

for (const heroId of ids) {
  const shard = JSON.parse(
    readFileSync(`data/generated/hero-detail/by-id/${heroId}.json`, "utf8"),
  );

  const normal = shard.normal ?? {};
  const firstConnection = normal.jobTree?.connections?.[0] ?? null;
  const firstBond = shard.bonds?.[0] ?? null;
  const firstSkill = normal.skills?.[0] ?? normal.skillList?.[0] ?? null;

  console.log(
    JSON.stringify(
      {
        heroId,
        top: keys(shard),
        presentation: keys(shard.presentation),
        normal: keys(normal),
        talent: keys(normal.talent),
        jobTree: keys(normal.jobTree),
        firstConnection: keys(firstConnection),
        firstConnectionJob: keys(firstConnection?.job),
        firstConnectionStats: keys(firstConnection?.finalDisplayStats),
        firstConnectionStatValues: keys(firstConnection?.finalDisplayStats?.values),
        skills: keys(normal.skills ?? normal.skillList),
        firstSkill: keys(firstSkill),
        bonds: keys(shard.bonds),
        firstBond: keys(firstBond),
        exclusiveEquipment: keys(shard.exclusiveEquipment),
        centralDiscipline: keys(shard.centralDiscipline),
        soldiers: keys(shard.soldiers),
        sp: keys(shard.sp),
        spTalent: keys(shard.sp?.talent),
        spStats: keys(shard.sp?.stats ?? shard.sp?.finalDisplayStats),
        spMissions: keys(shard.sp?.missions),
        validation: keys(shard.validation),
      },
      null,
      2,
    ),
  );
}

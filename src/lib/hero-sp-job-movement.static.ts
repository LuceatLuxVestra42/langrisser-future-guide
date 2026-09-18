import spMovementRaw from "../../data/generated/hero-sp-job-movement.v1.json";
import movementRaw from "../../data/generated/shared-movement-type-index.v1.json";

type SpMovementRecord = {
  heroId: number;
  jobConnectionId: number;
  jobId: number;
  nameCn: string | null;
  moveType: number;
  movePoint: number;
  sourceFields: ["MoveType", "BF_MovePoint"];
};

type SpMovementArtifact = {
  version: 1;
  stage: "hero-sp-job-movement-consumer";
  status: "FROZEN";
  owner: "hero-canonical";
  summary: {
    releasedSpHeroCount: number;
    releasedSpJobCount: number;
    hardErrorCount: number;
  };
  byHeroId: Record<string, SpMovementRecord>;
};

type MovementDefinition = {
  id: number;
  key: string;
  nameKr: string;
};

type SharedMovementArtifact = {
  version: 1;
  schemaId: "shared-movement-type-index/v1";
  status: "PASS";
  definitions: MovementDefinition[];
};

const spMovement = spMovementRaw as unknown as SpMovementArtifact;
const movement = movementRaw as unknown as SharedMovementArtifact;

if (
  spMovement.version !== 1 ||
  spMovement.stage !== "hero-sp-job-movement-consumer" ||
  spMovement.status !== "FROZEN" ||
  spMovement.owner !== "hero-canonical" ||
  spMovement.summary.releasedSpHeroCount !== 25 ||
  spMovement.summary.releasedSpJobCount !== 25 ||
  spMovement.summary.hardErrorCount !== 0
) {
  throw new Error("Hero SP job movement frozen artifact is not production-ready.");
}
if (movement.version !== 1 || movement.schemaId !== "shared-movement-type-index/v1" || movement.status !== "PASS") {
  throw new Error("Shared movement definition artifact is not production-ready.");
}

const definitionById = new Map(movement.definitions.map((definition) => [definition.id, definition]));
if (definitionById.size !== 5 || [1, 2, 3, 4, 5].some((id) => !definitionById.has(id))) {
  throw new Error("Shared movement definition coverage drift.");
}

export function getStaticHeroSpJobMovement(heroId: number, jobConnectionId: number, jobId: number) {
  const record = spMovement.byHeroId[String(heroId)];
  if (!record) return null;
  if (record.heroId !== heroId || record.jobConnectionId !== jobConnectionId || record.jobId !== jobId) {
    throw new Error(`Hero ${heroId} SP job movement identity mismatch.`);
  }
  if (!Number.isFinite(record.movePoint) || record.movePoint < 0) {
    throw new Error(`Hero ${heroId} SP Job ${jobId} has invalid frozen movement point.`);
  }
  const definition = definitionById.get(record.moveType);
  if (!definition) {
    throw new Error(`Hero ${heroId} SP Job ${jobId} has undefined frozen movement type ${record.moveType}.`);
  }
  return {
    ...record,
    moveTypeKey: definition.key,
    moveTypeNameKr: definition.nameKr,
  };
}

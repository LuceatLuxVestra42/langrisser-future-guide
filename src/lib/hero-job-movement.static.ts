import heroJobLinksRaw from "../../data/generated/hero-job-links.v1.json";
import movementRaw from "../../data/generated/shared-movement-type-index.v1.json";

type HeroJobLinkConnection = {
  jobConnectionId: number;
  role: string | null;
  jobId: number | null;
  job: {
    id: number;
    nameCn: string | null;
    nameEn: string | null;
    rank: number | null;
  } | null;
};

type HeroJobLinkRecord = {
  heroId: number;
  connections: HeroJobLinkConnection[];
};

type HeroJobLinksArtifact = {
  version: 1;
  status: "PASS";
  recordCount: number;
  records: HeroJobLinkRecord[];
};

type MovementDefinition = {
  id: number;
  key: string;
  nameKr: string;
  iconFileName: string;
};

type HeroJobMovementEntry = {
  moveType: number;
  movePoint: number | null;
  nameCn: string | null;
};

type SharedMovementArtifact = {
  version: 1;
  schemaId: "shared-movement-type-index/v1";
  status: "PASS";
  definitions: MovementDefinition[];
  heroJobsById: Record<string, HeroJobMovementEntry>;
};

export type HeroJobMovementRow = {
  jobConnectionId: number;
  role: string | null;
  jobId: number;
  nameCn: string | null;
  nameEn: string | null;
  rank: number | null;
  moveType: number;
  moveTypeKey: string;
  moveTypeNameKr: string;
  movePoint: number;
};

const heroJobLinks = heroJobLinksRaw as unknown as HeroJobLinksArtifact;
const movement = movementRaw as unknown as SharedMovementArtifact;

if (heroJobLinks.version !== 1 || heroJobLinks.status !== "PASS" || heroJobLinks.recordCount !== 267 || heroJobLinks.records.length !== 267) {
  throw new Error("Hero Job frozen relation is not production-ready.");
}
if (movement.version !== 1 || movement.schemaId !== "shared-movement-type-index/v1" || movement.status !== "PASS") {
  throw new Error("Shared movement frozen artifact is not production-ready.");
}

const definitionsById = new Map<number, MovementDefinition>();
for (const definition of movement.definitions) {
  if (!Number.isSafeInteger(definition.id) || definition.id <= 0 || definitionsById.has(definition.id)) {
    throw new Error(`Shared movement definition identity violation at moveType=${String(definition.id)}.`);
  }
  definitionsById.set(definition.id, definition);
}
if (definitionsById.size !== 5 || [1, 2, 3, 4, 5].some((id) => !definitionsById.has(id))) {
  throw new Error("Shared movement frozen definitions must be exactly IDs 1..5.");
}

const byHeroId = new Map<number, HeroJobMovementRow[]>();
const resolvedJobIds = new Set<number>();
for (const hero of heroJobLinks.records) {
  if (!Number.isSafeInteger(hero.heroId) || hero.heroId <= 0 || byHeroId.has(hero.heroId)) {
    throw new Error(`Hero Job movement Hero identity violation at heroId=${String(hero.heroId)}.`);
  }

  const seenConnectionIds = new Set<number>();
  const rows = hero.connections.map((connection) => {
    if (!Number.isSafeInteger(connection.jobConnectionId) || connection.jobConnectionId <= 0 || seenConnectionIds.has(connection.jobConnectionId)) {
      throw new Error(`Hero ${hero.heroId} has invalid or duplicate JobConnection ${String(connection.jobConnectionId)}.`);
    }
    seenConnectionIds.add(connection.jobConnectionId);

    const jobId = connection.jobId;
    if (typeof jobId !== "number" || !Number.isSafeInteger(jobId) || jobId <= 0 || connection.job?.id !== jobId) {
      throw new Error(`Hero ${hero.heroId} JobConnection ${connection.jobConnectionId} has invalid frozen Job identity.`);
    }

    const movementEntry = movement.heroJobsById[String(jobId)];
    if (!movementEntry) {
      throw new Error(`Hero ${hero.heroId} JobConnection ${connection.jobConnectionId} Job ${jobId} has no frozen movement record.`);
    }
    const definition = definitionsById.get(movementEntry.moveType);
    if (!definition) {
      throw new Error(`Hero Job ${jobId} references undefined MoveType ${String(movementEntry.moveType)}.`);
    }
    if (movementEntry.movePoint == null || !Number.isFinite(movementEntry.movePoint) || movementEntry.movePoint < 0) {
      throw new Error(`Hero Job ${jobId} has invalid BF_MovePoint ${String(movementEntry.movePoint)}.`);
    }

    resolvedJobIds.add(jobId);
    return {
      jobConnectionId: connection.jobConnectionId,
      role: connection.role,
      jobId,
      nameCn: connection.job?.nameCn ?? movementEntry.nameCn ?? null,
      nameEn: connection.job?.nameEn ?? null,
      rank: connection.job?.rank ?? null,
      moveType: movementEntry.moveType,
      moveTypeKey: definition.key,
      moveTypeNameKr: definition.nameKr,
      movePoint: movementEntry.movePoint,
    };
  });

  byHeroId.set(hero.heroId, rows);
}

if (resolvedJobIds.size !== 804 || Object.keys(movement.heroJobsById).length !== 804) {
  throw new Error(`Hero Job movement frozen coverage mismatch: ${resolvedJobIds.size}/${Object.keys(movement.heroJobsById).length}.`);
}

export function getStaticHeroJobMovement(heroId: number) {
  return byHeroId.get(heroId) ?? null;
}

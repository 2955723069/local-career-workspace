import { requestToPromise, runTransaction } from "../../db/database";
import { STORE_NAMES } from "../../db/schema";
import {
  assertAbsoluteIsoTimestamp,
  nextUpdatedTimestamp,
} from "../../db/timestamps";
import { STAGE_KINDS } from "../../db/types";
import type {
  Application,
  ApplicationTimelineEvent,
  Stage,
  StageKind,
} from "../../db/types";

export interface DefaultStageDefinition {
  id: string;
  name: string;
  color: string;
  order: number;
  kind: StageKind;
}

export const DEFAULT_STAGES = [
  { id: "stage-saved", name: "收藏", color: "#64748b", order: 0, kind: "normal" },
  { id: "stage-applied", name: "已申请", color: "#2563eb", order: 1, kind: "normal" },
  { id: "stage-assessment", name: "笔试/测评", color: "#7c3aed", order: 2, kind: "normal" },
  { id: "stage-interviewing", name: "面试中", color: "#d97706", order: 3, kind: "normal" },
  { id: "stage-offer", name: "已获 Offer", color: "#15803d", order: 4, kind: "offer" },
  { id: "stage-rejected", name: "已拒绝", color: "#b91c1c", order: 5, kind: "rejected" },
  { id: "stage-withdrawn", name: "已放弃", color: "#475569", order: 6, kind: "withdrawn" },
] as const satisfies readonly DefaultStageDefinition[];

export interface StageServiceDependencies {
  now?: () => string;
  createId?: () => string;
}

export interface CreateStageInput {
  name: string;
  color: string;
  order: number;
  kind?: StageKind;
}

export interface UpdateStageInput {
  name?: string;
  color?: string;
  order?: number;
}

export interface StageDeletePreview {
  id: string;
  name: string;
  kind: StageKind;
  applicationCount: number;
}

export interface StageDeleteOptions {
  confirmed?: boolean;
  replacementStageId?: string;
}

export class StageConfirmationRequired extends Error {
  constructor() {
    super("Stage deletion requires explicit confirmation.");
    this.name = "StageConfirmationRequired";
  }
}

export class StageReplacementRequired extends Error {
  readonly applicationCount: number;

  constructor(applicationCount: number) {
    super("A replacement stage is required for associated applications.");
    this.name = "StageReplacementRequired";
    this.applicationCount = applicationCount;
  }
}

function defaultNow(): string {
  return new Date().toISOString();
}

function defaultCreateId(): string {
  return crypto.randomUUID();
}

function isStageKind(value: unknown): value is StageKind {
  return typeof value === "string" && STAGE_KINDS.includes(value as StageKind);
}

function validateEditableValues(input: { name?: string; color?: string; order?: number }): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new Error("Stage name cannot be empty.");
  }
  if (input.color !== undefined && !input.color.trim()) {
    throw new Error("Stage color cannot be empty.");
  }
  if (input.order !== undefined && (!Number.isInteger(input.order) || input.order < 0)) {
    throw new Error("Stage order must be a non-negative integer.");
  }
}

export class StageService {
  readonly #database: IDBDatabase;
  readonly #now: () => string;
  readonly #createId: () => string;

  constructor(database: IDBDatabase, dependencies: StageServiceDependencies = {}) {
    this.#database = database;
    this.#now = dependencies.now ?? defaultNow;
    this.#createId = dependencies.createId ?? defaultCreateId;
  }

  async ensureDefaultStages(): Promise<Stage[]> {
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "Stage.createdAt");
    await runTransaction(this.#database, STORE_NAMES.stages, "readwrite", async (transaction) => {
      const store = transaction.objectStore(STORE_NAMES.stages);
      for (const definition of DEFAULT_STAGES) {
        const existing = await requestToPromise<Stage | undefined>(store.get(definition.id));
        if (existing) {
          if (!isStageKind(existing.kind)) {
            throw new Error(`Invalid Stage.kind: ${existing.id}`);
          }
          continue;
        }
        const stage: Stage = {
          ...definition,
          id: definition.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        await requestToPromise(store.add(stage));
      }
    });
    return this.listStages();
  }

  initializeDefaults(): Promise<Stage[]> {
    return this.ensureDefaultStages();
  }

  getStage(stageId: string): Promise<Stage | undefined> {
    return runTransaction(this.#database, STORE_NAMES.stages, "readonly", (transaction) =>
      requestToPromise<Stage | undefined>(
        transaction.objectStore(STORE_NAMES.stages).get(stageId),
      ),
    );
  }

  get(stageId: string): Promise<Stage | undefined> {
    return this.getStage(stageId);
  }

  async listStages(): Promise<Stage[]> {
    const stages = await runTransaction(
      this.#database,
      STORE_NAMES.stages,
      "readonly",
      (transaction) =>
        requestToPromise<Stage[]>(transaction.objectStore(STORE_NAMES.stages).getAll()),
    );
    return stages.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  list(): Promise<Stage[]> {
    return this.listStages();
  }

  async createStage(input: CreateStageInput): Promise<Stage> {
    validateEditableValues(input);
    const kind = input.kind ?? "normal";
    if (!isStageKind(kind)) throw new Error("Invalid Stage.kind");
    const timestamp = this.#now();
    assertAbsoluteIsoTimestamp(timestamp, "Stage.createdAt");
    const stage: Stage = {
      ...input,
      kind,
      id: this.#createId(),
      name: input.name.trim(),
      color: input.color.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await runTransaction(this.#database, STORE_NAMES.stages, "readwrite", (transaction) =>
      requestToPromise(transaction.objectStore(STORE_NAMES.stages).add(stage)),
    );
    return stage;
  }

  create(input: CreateStageInput): Promise<Stage> {
    return this.createStage(input);
  }

  async updateStage(stageId: string, patch: UpdateStageInput): Promise<Stage> {
    if ("kind" in patch) {
      throw new Error("Stage.kind cannot be changed.");
    }
    validateEditableValues(patch);
    const candidate = this.#now();
    assertAbsoluteIsoTimestamp(candidate, "Stage.updatedAt");
    return runTransaction(this.#database, STORE_NAMES.stages, "readwrite", async (transaction) => {
      const store = transaction.objectStore(STORE_NAMES.stages);
      const existing = await requestToPromise<Stage | undefined>(store.get(stageId));
      if (!existing) throw new Error(`Stage not found: ${stageId}`);
      const updated: Stage = {
        ...existing,
        ...patch,
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.color !== undefined ? { color: patch.color.trim() } : {}),
        id: existing.id,
        kind: existing.kind,
        createdAt: existing.createdAt,
        updatedAt: nextUpdatedTimestamp(candidate, existing.updatedAt),
      };
      await requestToPromise(store.put(updated));
      return updated;
    });
  }

  update(stageId: string, patch: UpdateStageInput): Promise<Stage> {
    return this.updateStage(stageId, patch);
  }

  renameStage(stageId: string, name: string): Promise<Stage> {
    return this.updateStage(stageId, { name });
  }

  setStageColor(stageId: string, color: string): Promise<Stage> {
    return this.updateStage(stageId, { color });
  }

  async reorderStages(stageIds: readonly string[]): Promise<Stage[]> {
    if (new Set(stageIds).size !== stageIds.length) {
      throw new Error("Stage order cannot contain duplicate ids.");
    }
    const candidate = this.#now();
    assertAbsoluteIsoTimestamp(candidate, "Stage.updatedAt");
    await runTransaction(this.#database, STORE_NAMES.stages, "readwrite", async (transaction) => {
      const store = transaction.objectStore(STORE_NAMES.stages);
      const existing = await requestToPromise<Stage[]>(store.getAll());
      const existingIds = new Set(existing.map(({ id }) => id));
      if (stageIds.length !== existing.length || stageIds.some((id) => !existingIds.has(id))) {
        throw new Error("Stage order must include every stage exactly once.");
      }
      const byId = new Map(existing.map((stage) => [stage.id, stage]));
      for (const [order, stageId] of stageIds.entries()) {
        const stage = byId.get(stageId)!;
        const updated: Stage = {
          ...stage,
          order,
          updatedAt: nextUpdatedTimestamp(candidate, stage.updatedAt),
        };
        await requestToPromise(store.put(updated));
      }
    });
    return this.listStages();
  }

  reorder(stageIds: readonly string[]): Promise<Stage[]> {
    return this.reorderStages(stageIds);
  }

  async previewDelete(stageId: string): Promise<StageDeletePreview> {
    return runTransaction(
      this.#database,
      [STORE_NAMES.stages, STORE_NAMES.applications],
      "readonly",
      async (transaction) => {
        const stage = await requestToPromise<Stage | undefined>(
          transaction.objectStore(STORE_NAMES.stages).get(stageId),
        );
        if (!stage) throw new Error(`Stage not found: ${stageId}`);
        const applicationCount = await requestToPromise(
          transaction
            .objectStore(STORE_NAMES.applications)
            .index("stageId")
            .count(stageId),
        );
        return { id: stage.id, name: stage.name, kind: stage.kind, applicationCount };
      },
    );
  }

  async deleteStage(stageId: string, options: StageDeleteOptions = {}): Promise<void> {
    if (!options.confirmed) throw new StageConfirmationRequired();
    const candidate = this.#now();
    assertAbsoluteIsoTimestamp(candidate, "Stage.deletedAt");
    await runTransaction(
      this.#database,
      [STORE_NAMES.stages, STORE_NAMES.applications, STORE_NAMES.applicationTimelineEvents],
      "readwrite",
      async (transaction) => {
        const stageStore = transaction.objectStore(STORE_NAMES.stages);
        const stage = await requestToPromise<Stage | undefined>(stageStore.get(stageId));
        if (!stage) throw new Error(`Stage not found: ${stageId}`);
        if (stage.kind !== "normal") {
          throw new Error("A result stage cannot be deleted.");
        }
        const applicationStore = transaction.objectStore(STORE_NAMES.applications);
        const applications = await requestToPromise<Application[]>(
          applicationStore.index("stageId").getAll(stageId),
        );
        if (applications.length > 0 && !options.replacementStageId) {
          throw new StageReplacementRequired(applications.length);
        }
        let replacement: Stage | undefined;
        if (options.replacementStageId) {
          if (options.replacementStageId === stageId) {
            throw new Error("Replacement stage must differ from the deleted stage.");
          }
          replacement = await requestToPromise<Stage | undefined>(
            stageStore.get(options.replacementStageId),
          );
          if (!replacement) {
            throw new Error(`Replacement stage not found: ${options.replacementStageId}`);
          }
        }
        for (const application of applications) {
          const timestamp = nextUpdatedTimestamp(candidate, application.updatedAt);
          const updated: Application = {
            ...application,
            stageId: replacement!.id,
            updatedAt: timestamp,
          };
          const event: ApplicationTimelineEvent = {
            id: this.#createId(),
            createdAt: timestamp,
            updatedAt: timestamp,
            applicationId: application.id,
            type: "stage-changed",
            fromValue: stageId,
            toValue: replacement!.id,
            note: "Stage replaced after deletion.",
          };
          await requestToPromise(applicationStore.put(updated));
          await requestToPromise(
            transaction.objectStore(STORE_NAMES.applicationTimelineEvents).add(event),
          );
        }
        await requestToPromise(stageStore.delete(stageId));
      },
    );
  }

  async confirmDelete(
    stageId: string,
    preview: StageDeletePreview,
    replacementStageId?: string,
  ): Promise<void> {
    if (preview.id !== stageId) {
      throw new Error("Stage delete preview does not match the stage.");
    }
    await this.deleteStage(stageId, { confirmed: true, replacementStageId });
  }

  async countApplicationsByKind(): Promise<Record<StageKind, number>> {
    return runTransaction(
      this.#database,
      [STORE_NAMES.stages, STORE_NAMES.applications],
      "readonly",
      async (transaction) => {
        const stages = await requestToPromise<Stage[]>(
          transaction.objectStore(STORE_NAMES.stages).getAll(),
        );
        const applications = await requestToPromise<Application[]>(
          transaction.objectStore(STORE_NAMES.applications).getAll(),
        );
        const kindsById = new Map(stages.map(({ id, kind }) => [id, kind]));
        const counts: Record<StageKind, number> = {
          normal: 0,
          offer: 0,
          rejected: 0,
          withdrawn: 0,
        };
        for (const application of applications) {
          const kind = kindsById.get(application.stageId);
          if (kind) counts[kind] += 1;
        }
        return counts;
      },
    );
  }

  async getOutcomeCounts(): Promise<Pick<Record<StageKind, number>, "offer" | "rejected" | "withdrawn">> {
    const counts = await this.countApplicationsByKind();
    return {
      offer: counts.offer,
      rejected: counts.rejected,
      withdrawn: counts.withdrawn,
    };
  }

  getResultCounts(): Promise<Pick<Record<StageKind, number>, "offer" | "rejected" | "withdrawn">> {
    return this.getOutcomeCounts();
  }
}

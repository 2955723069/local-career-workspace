import { exportBackup as exportEncryptedBackup } from "../../backup/crypto";
import {
  buildImportPlan as createImportPlan,
  commitBackupImport as commitImportPlan,
  prepareBackupImport as prepareImport,
} from "../../backup/importTransaction";
import type { BackupEnvelope, BackupKind } from "../../backup/format";
import type {
  BackupConflictResolution,
  BackupImportSession,
  ImportPlan,
} from "../../backup/importTransaction";

export class BackupService {
  readonly #database: IDBDatabase;

  constructor(database: IDBDatabase) {
    this.#database = database;
  }

  exportBackup(options: { kind: BackupKind; password: string }): Promise<BackupEnvelope> {
    return exportEncryptedBackup(this.#database, options);
  }

  prepareBackupImport(encryptedInput: unknown, password: string): Promise<BackupImportSession> {
    return prepareImport(this.#database, encryptedInput, password);
  }

  buildImportPlan(
    session: BackupImportSession,
    resolutions?: readonly BackupConflictResolution[],
  ): ImportPlan {
    return createImportPlan(session, resolutions);
  }

  commitBackupImport(plan: ImportPlan): Promise<void> {
    return commitImportPlan(this.#database, plan);
  }
}

export {
  createImportPlan as buildImportPlan,
  commitImportPlan as commitBackupImport,
  prepareImport as prepareBackupImport,
};
export {
  type BackupConflict,
  type BackupConflictResolution,
  type BackupImportSession,
  type BuildImportPlanOptions,
  type ImportPlan,
  type ImportResolution,
  type ImportableStoreName,
} from "../../backup/importTransaction";
export type { BackupEnvelope, BackupKind } from "../../backup/format";

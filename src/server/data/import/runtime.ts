import {env} from "../../../lib/env";
import {ConnectionRepository} from "../../connectors/csv/repository";
import {FileArtifactStore} from "./artifact-store";
import {PostgresImportRepository} from "./postgres-repository";
import {CsvImportService} from "./service";

const globalRuntime = globalThis as unknown as {
  csvImportService?: CsvImportService;
  connectionRepository?: ConnectionRepository;
  importRepository?: PostgresImportRepository;
};

export function importRepository() {
  globalRuntime.importRepository ??= new PostgresImportRepository();
  return globalRuntime.importRepository;
}

export function csvImportService() {
  const config = env();
  globalRuntime.csvImportService ??= new CsvImportService(
    importRepository(),
    new FileArtifactStore(config.ARTIFACT_ROOT),
    config.IMPORT_BATCH_SIZE,
  );
  return globalRuntime.csvImportService;
}

export function connectionRepository() {
  globalRuntime.connectionRepository ??= new ConnectionRepository();
  return globalRuntime.connectionRepository;
}

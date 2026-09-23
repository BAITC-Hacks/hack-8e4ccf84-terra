import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import type {ArtifactStore} from "./types";

export class FileArtifactStore implements ArtifactStore {
  constructor(private readonly root: string) {}

  async saveRaw(sha256: string, bytes: Uint8Array) {
    const directory = path.resolve(this.root, "raw", sha256.slice(0, 2));
    await mkdir(directory, {recursive: true});
    const target = path.join(directory, `${sha256}.csv`);
    try {
      await writeFile(target, bytes, {flag: "wx"});
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
    return target;
  }
}

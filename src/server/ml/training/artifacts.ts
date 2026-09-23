import {mkdir, rename, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), {recursive: true});
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const json = JSON.stringify(value, (_key, item) => {
    if (typeof item === "number" && !Number.isFinite(item)) {
      throw new Error("Refusing to persist NaN or Infinity in an ML artifact");
    }
    return item;
  }, 2);
  await writeFile(temporary, `${json}\n`, {encoding: "utf8", flag: "wx"});
  await rename(temporary, path);
}

export function jobPath(root: string, jobId: string): string {
  return join(root, "jobs", `${jobId}.json`);
}

export function artifactPath(root: string, artifactId: string): string {
  return join(root, "models", `${artifactId}.json`);
}

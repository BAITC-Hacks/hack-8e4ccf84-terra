import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {trainApprovedModel, type ApprovedTrainingInput} from "../src/server/ml/training/approved";
import {writeJsonAtomic} from "../src/server/ml/training/artifacts";

async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const output = resolve(option("--out") ?? ".data/ml/approved");
  const inputPath = option("--input");
  if (!inputPath) {
    await writeJsonAtomic(`${output}/report.json`, {status: "BLOCKED", artifact: null,
      reason: "Canonical archived-forecast training releases were not supplied. Resource CSV weather is observed, not forecast.",
      next: "Supply --input manifest.json with historical canonical snapshots, pre-February training targets and explicit forecast feature selectors. See docs/handoffs/parallel-P2.md."});
    console.log(`BLOCKED: ${output}/report.json`);
    process.exitCode = 2;
    return;
  }
  const input = JSON.parse(await readFile(resolve(inputPath), "utf8")) as ApprovedTrainingInput;
  const artifact = trainApprovedModel(input);
  // Content-addressed filename: a failed later run cannot masquerade as its artifact.
  const path = `${output}/${artifact.deployment.checksum}.json`;
  await writeJsonAtomic(path, artifact);
  await writeJsonAtomic(`${output}/report.json`, {status: artifact.deployment.status, artifact: path,
    checksum: artifact.deployment.checksum, evidence: artifact.deployment.evidence,
    reason: artifact.deployment.approvalReason, cutoff: artifact.cutoff, inputHash: artifact.inputHash,
    selected: artifact.validation.candidates.find((row) => row.id === artifact.selectedCandidateId),
    persistence: artifact.deployment.persistence, validation: artifact.validation});
  console.log(`${artifact.deployment.status}: ${path}`);
}

main().catch(async (error: unknown) => {
  const args = process.argv.slice(2);
  const index = args.indexOf("--out");
  const output = resolve(index < 0 ? ".data/ml/approved" : args[index + 1]);
  await writeJsonAtomic(`${output}/report.json`, {status: "FAILED", artifact: null,
    reason: "Training input or model validation failed; no deployable artifact was produced by this run."});
  console.error(error instanceof Error ? error.message : "Training failed");
  process.exitCode = 1;
});

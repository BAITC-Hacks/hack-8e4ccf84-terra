import {demo} from "./demo/config";
import {AppError} from "../agent/errors";

export function getDomainConfig(key: string) {
  if (key === "demo") return demo;
  throw new AppError("unknown_domain", "Unknown workspace domain.");
}

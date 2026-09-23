import type {DomainConfig} from "../../agent/types";
import {instructions} from "./prompt";
import {getCase} from "./tools/get-case";
import {searchGuidance} from "./tools/search-guidance";
import {applyCaseAction} from "./tools/apply-case-action";

export const demo: DomainConfig = {
  key: "demo",
  agentName: "Case reviewer",
  instructions,
  tools: [getCase, searchGuidance, applyCaseAction],
};

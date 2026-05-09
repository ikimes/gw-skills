export { GameModes } from "../../shared/skills";
export type { GameMode, SkillListResponse, SummarySkill } from "../../shared/skills";

export const SearchModes = {
  All: "all",
  PveOnly: "pve_only",
  PvpUsable: "pvp_usable",
} as const;

export type SearchMode = (typeof SearchModes)[keyof typeof SearchModes];

export type SearchState = {
  q: string;
  professions: string[];
  mode: SearchMode;
  eliteOnly: boolean;
  submitted: boolean;
  limit: number;
  offset: number;
};

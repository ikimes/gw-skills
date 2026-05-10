export { GameModes } from "../../shared/skills";
export type { GameMode, SkillListResponse, SummarySkill } from "../../shared/skills";

export const SearchModes = {
  All: "all",
  PveOnly: "pve_only",
  HidePvp: "hide_pvp",
} as const;

export type SearchMode = (typeof SearchModes)[keyof typeof SearchModes];

export type SearchState = {
  q: string;
  professions: string[];
  mode: SearchMode;
  eliteOnly: boolean;
  type?: string;
  attribute?: string;
  campaign?: string;
  submitted: boolean;
  limit: number;
  offset: number;
};

export type SearchDraft = Pick<SearchState, "q" | "professions" | "mode" | "eliteOnly" | "type" | "attribute" | "campaign">;

export type SearchFacetOption = {
  value: string;
  count: number;
};

export type SearchFacetResponse = {
  profession: SearchFacetOption[];
  attribute: SearchFacetOption[];
  type: SearchFacetOption[];
  campaign: SearchFacetOption[];
  gameMode: Array<{ value: string; count: number }>;
  elite: Array<{ value: boolean; count: number }>;
  pveOnly: Array<{ value: boolean; count: number }>;
  intent: SearchFacetOption[];
  mechanic: SearchFacetOption[];
  appliesTo: SearchFacetOption[];
  area: SearchFacetOption[];
};

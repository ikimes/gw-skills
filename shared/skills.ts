export const GameModes = {
  Default: "default",
  Pvp: "pvp",
  PveOnly: "pve_only",
} as const;

export type GameMode = (typeof GameModes)[keyof typeof GameModes];

export type SkillCost = {
  energy?: number | string;
  adrenaline?: number | string;
  upkeep?: number | string;
  activation?: number | string;
  recharge?: number | string;
  sacrifice?: number | string;
};

export type SkillArea = {
  key: string;
  label: string;
};

export type SkillSemantic = {
  intents: string[];
  mechanics: string[];
  appliesTo: string[];
  notes?: string;
};

export type SummarySkill = {
  name: string;
  pageId: number;
  wiki: string;
  iconUrl?: string;
  profession?: string;
  attribute?: string;
  type?: string;
  campaign?: string;
  elite: boolean;
  pveOnly: boolean;
  gameMode: GameMode;
  cost: SkillCost;
  description?: string;
  conciseDescription?: string;
  target?: string;
  progression: {
    hasProgression: boolean;
    attribute?: string;
    columns: Array<{
      key: string;
      name: string;
    }>;
  };
  areas: SkillArea[];
  semantic: SkillSemantic;
  categories: string[];
  searchText: string;
};

export type SkillFilters = {
  profession?: string[];
  attribute?: string;
  type?: string;
  campaign?: string;
  gameMode?: GameMode;
  elite?: boolean;
  pveOnly?: boolean;
  intent?: string;
  mechanic?: string;
  appliesTo?: string;
  area?: string;
};

export type Pagination = {
  limit: number;
  offset: number;
};

export type SkillListResponse = {
  total: number;
  limit: number;
  offset: number;
  results: SummarySkill[];
};

export type SkillSearchResponse = SkillListResponse & {
  query: string;
};

export type SearchPresetChip = {
  key: string;
  label: string;
  query: Record<string, string>;
  total: number;
};

export type SearchPresetResponse = {
  id: string;
  label: string;
  description: string;
  primary: {
    label: string;
    query: Record<string, string>;
    total: number;
    limit: number;
    offset: number;
    results: SummarySkill[];
  };
  chips: SearchPresetChip[];
};

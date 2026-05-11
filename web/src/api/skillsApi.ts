import type { SearchFacetResponse, SearchState, SkillListResponse } from "../types";
import { buildFacetQueryParams, buildSkillQueryParams, type FacetQueryState } from "../utils/searchParams";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function fetchSkills(state: SearchState, signal: AbortSignal): Promise<SkillListResponse> {
  const endpoint = state.q.trim() ? "/api/search" : "/api/skills";
  const params = buildSkillQueryParams(state);

  const response = await fetch(`${API_BASE}${endpoint}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return response.json() as Promise<SkillListResponse>;
}

export async function fetchFacets(state: FacetQueryState, signal: AbortSignal): Promise<SearchFacetResponse> {
  const params = buildFacetQueryParams(state);
  const response = await fetch(`${API_BASE}/api/facets?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return response.json() as Promise<SearchFacetResponse>;
}

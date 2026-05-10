import { SearchModes, type SearchFacetResponse, type SearchState, type SkillListResponse } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function fetchSkills(state: SearchState, signal: AbortSignal): Promise<SkillListResponse> {
  const endpoint = state.q.trim() ? "/api/search" : "/api/skills";
  const params = new URLSearchParams();

  if (state.q.trim()) {
    params.set("q", state.q.trim());
  }

  if (state.professions.length > 0) {
    params.set("profession", state.professions.join(","));
  }

  if (state.mode === SearchModes.PveOnly) {
    params.set("pveOnly", "true");
  } else if (state.mode === SearchModes.HidePvp) {
    params.set("hidePvp", "true");
  }

  if (state.eliteOnly) {
    params.set("elite", "true");
  }

  if (state.type) {
    params.set("type", state.type);
  }

  if (state.attribute) {
    params.set("attribute", state.attribute);
  }

  if (state.campaign) {
    params.set("campaign", state.campaign);
  }

  params.set("limit", String(state.limit));
  params.set("offset", String(state.offset));

  const response = await fetch(`${API_BASE}${endpoint}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return response.json() as Promise<SkillListResponse>;
}

export async function fetchFacets(state: Pick<SearchState, "professions" | "mode" | "eliteOnly" | "type" | "attribute" | "campaign">, signal: AbortSignal): Promise<SearchFacetResponse> {
  const params = new URLSearchParams();

  if (state.professions.length > 0) {
    params.set("profession", state.professions.join(","));
  }

  if (state.mode === SearchModes.PveOnly) {
    params.set("pveOnly", "true");
  } else if (state.mode === SearchModes.HidePvp) {
    params.set("hidePvp", "true");
  }

  if (state.eliteOnly) {
    params.set("elite", "true");
  }

  if (state.type) {
    params.set("type", state.type);
  }

  if (state.attribute) {
    params.set("attribute", state.attribute);
  }

  if (state.campaign) {
    params.set("campaign", state.campaign);
  }

  const response = await fetch(`${API_BASE}/api/facets?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return response.json() as Promise<SearchFacetResponse>;
}

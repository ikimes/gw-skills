import { SearchModes, type SearchState, type SkillListResponse } from "../types";

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
  } else if (state.mode === SearchModes.PvpUsable) {
    params.set("pveOnly", "false");
  }

  if (state.eliteOnly) {
    params.set("elite", "true");
  }

  params.set("limit", String(state.limit));
  params.set("offset", String(state.offset));

  const response = await fetch(`${API_BASE}${endpoint}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return response.json() as Promise<SkillListResponse>;
}

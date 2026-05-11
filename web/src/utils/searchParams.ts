import { DEFAULT_LIMIT } from "../constants";
import { SearchModes, type SearchDraft, type SearchState } from "../types";

export type FacetQueryState = Pick<SearchState, "professions" | "mode" | "eliteOnly" | "type" | "attribute" | "campaign">;

export function toFacetQueryState(state: SearchDraft): FacetQueryState {
  return {
    professions: state.professions,
    mode: state.mode,
    eliteOnly: state.eliteOnly,
    type: state.type,
    attribute: state.attribute,
    campaign: state.campaign,
  };
}

export function buildSkillQueryParams(state: SearchState): URLSearchParams {
  const params = buildFacetQueryParams(state);
  const query = state.q.trim();

  if (query) {
    params.set("q", query);
  }

  params.set("limit", String(state.limit));
  params.set("offset", String(state.offset));
  return params;
}

export function buildFacetQueryParams(state: FacetQueryState): URLSearchParams {
  const params = new URLSearchParams();

  appendApiFilterParams(params, state);
  return params;
}

export function buildRouteSearchParams(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();
  const query = state.q.trim();

  if (query) {
    params.set("q", query);
  }

  if (isBrowseAllRoute(state)) {
    params.set("browse", "all");
  }

  appendRouteFilterParams(params, state);

  if (state.limit !== DEFAULT_LIMIT) {
    params.set("limit", String(state.limit));
  }

  return params;
}

export function hasSearchCriteria(state: Pick<SearchState, "submitted" | "q"> & FacetQueryState): boolean {
  return (
    state.submitted
    || hasDraftCriteria(state)
  );
}

export function hasDraftCriteria(state: SearchDraft | FacetQueryState & { q?: string }): boolean {
  return (
    (state.q?.trim() ?? "") !== ""
    || state.professions.length > 0
    || state.mode !== SearchModes.All
    || state.eliteOnly
    || Boolean(state.type)
    || Boolean(state.attribute)
    || Boolean(state.campaign)
  );
}

function isBrowseAllRoute(state: SearchState): boolean {
  return (
    state.submitted
    && state.q.trim() === ""
    && state.professions.length === 0
    && state.mode === SearchModes.All
    && !state.eliteOnly
    && !state.type
    && !state.attribute
    && !state.campaign
  );
}

function appendApiFilterParams(params: URLSearchParams, state: FacetQueryState): void {
  appendSharedFilterParams(params, state);

  if (state.mode === SearchModes.PveOnly) {
    params.set("pveOnly", "true");
  } else if (state.mode === SearchModes.HidePvp) {
    params.set("hidePvp", "true");
  }
}

function appendRouteFilterParams(params: URLSearchParams, state: FacetQueryState): void {
  appendSharedFilterParams(params, state);

  if (state.mode !== SearchModes.All) {
    params.set("mode", state.mode);
  }
}

function appendSharedFilterParams(params: URLSearchParams, state: FacetQueryState): void {
  if (state.professions.length > 0) {
    params.set("profession", state.professions.join(","));
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
}

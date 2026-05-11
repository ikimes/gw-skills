import { useEffect, useMemo, useState } from "react";

import { fetchFacets, fetchSkills } from "../api/skillsApi";
import { SearchModes, type SearchDraft, type SearchFacetResponse, type SearchMode, type SearchState, type SkillListResponse } from "../types";
import { hasDraftCriteria, hasSearchCriteria, toFacetQueryState } from "../utils/searchParams";
import { mergeSkillResults } from "../utils/searchResults";
import { buildUrl, getDefaultState, readStateFromUrl } from "../utils/searchUrl";

export function useSkillSearch() {
  const [state, setState] = useState<SearchState>(() => readStateFromUrl());
  const [draftState, setDraftState] = useState<SearchDraft>(() => toDraft(readStateFromUrl()));
  const [response, setResponse] = useState<SkillListResponse | null>(null);
  const [facets, setFacets] = useState<SearchFacetResponse | null>(null);
  const [isLoadingFacets, setIsLoadingFacets] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestOffset, setRequestOffset] = useState(0);

  const facetQueryState = useMemo(() => toFacetQueryState(draftState), [
    draftState.professions,
    draftState.mode,
    draftState.eliteOnly,
    draftState.type,
    draftState.attribute,
    draftState.campaign,
  ]);
  const hasCriteria = hasSearchCriteria(state);
  const hasDraftCriteriaValue = hasDraftCriteria(draftState);
  const hasDraftChanges = !isSameDraft(draftState, state);
  const canReset = hasCriteria || hasDraftCriteriaValue;
  const hasMore = response ? response.results.length < response.total : false;

  useEffect(() => {
    const onPopState = () => {
      const next = readStateFromUrl();
      setState(next);
      setDraftState(toDraft(next));
      setRequestOffset(0);
      setResponse(null);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoadingFacets(true);

    fetchFacets(facetQueryState, controller.signal)
      .then((data) => setFacets(data))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        setFacets(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingFacets(false);
        }
      });

    return () => controller.abort();
  }, [facetQueryState]);

  useEffect(() => {
    if (!hasCriteria) {
      setResponse(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetchSkills({ ...state, offset: requestOffset }, controller.signal)
      .then((data) => {
        setResponse((current) => mergeSkillResults(current, data, requestOffset));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        setError(err instanceof Error ? err.message : "Unable to load skills.");
        setResponse(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [hasCriteria, requestOffset, state]);

  const summaryText = useMemo(() => {
    if (!hasCriteria) {
      return "Search by name, effect, profession, type, or buildcraft phrase.";
    }

    if (!response) {
      return isLoading ? "Searching..." : "";
    }

    const shownStart = response.total === 0 ? 0 : 1;
    const shownEnd = Math.min(response.results.length, response.total);
    return `${shownStart}-${shownEnd} of ${response.total} skills`;
  }, [hasCriteria, isLoading, response]);

  function applyState(next: SearchState) {
    setDraftState(toDraft(next));
    const merged = { ...state, ...next };
    setRequestOffset(0);
    setResponse(null);
    setState(merged);
    window.history.pushState(null, "", buildUrl(merged));
  }

  function submitSearch() {
    const next: SearchState = {
      ...state,
      ...draftState,
      q: draftState.q.trim(),
      submitted: true,
      offset: 0,
    };
    applyState(next);
    scrollToTopIfNeeded();
  }

  function resetSearch() {
    const next = getDefaultState();
    setDraftState(toDraft(next));
    setRequestOffset(0);
    setResponse(null);
    setState(next);
    window.history.pushState(null, "", "/");
    scrollToTopIfNeeded();
  }

  function toggleProfession(profession: string) {
    setDraftState((current) => {
      const professions = current.professions.includes(profession)
        ? current.professions.filter((item) => item !== profession)
        : [...current.professions, profession];

      return {
        ...current,
        professions,
      };
    });
  }

  function clearProfessions() {
    setDraftState((current) => ({
      ...current,
      professions: [],
    }));
  }

  function toggleMode(mode: Exclude<SearchMode, "all">) {
    setDraftState((current) => ({
      ...current,
      mode: current.mode === mode ? SearchModes.All : mode,
    }));
  }

  function toggleEliteOnly() {
    setDraftState((current) => ({
      ...current,
      eliteOnly: !current.eliteOnly,
    }));
  }

  function toggleType(type: string) {
    setDraftState((current) => ({
      ...current,
      type: current.type === type ? undefined : type,
    }));
  }

  function toggleAttribute(attribute: string) {
    setDraftState((current) => ({
      ...current,
      attribute: current.attribute === attribute ? undefined : attribute,
    }));
  }

  function toggleCampaign(campaign: string) {
    setDraftState((current) => ({
      ...current,
      campaign: current.campaign === campaign ? undefined : campaign,
    }));
  }

  function discardDraftChanges() {
    setDraftState(toDraft(state));
  }

  function loadMore() {
    if (!response || isLoading || !hasMore) {
      return;
    }

    setRequestOffset(response.results.length);
  }

  return {
    canReset,
    clearProfessions,
    draftState,
    error,
    facets,
    hasDraftChanges,
    hasMore,
    hasCriteria,
    isLoading,
    isLoadingFacets,
    loadMore,
    response,
    state,
    summaryText,
    discardDraftChanges,
    resetSearch,
    setDraftQuery: (q: string) => setDraftState((current) => ({ ...current, q })),
    submitSearch,
    toggleAttribute,
    toggleCampaign,
    toggleEliteOnly,
    toggleMode,
    toggleProfession,
    toggleType,
  };
}

function toDraft(state: SearchState): SearchDraft {
  return {
    q: state.q,
    professions: [...state.professions],
    mode: state.mode,
    eliteOnly: state.eliteOnly,
    type: state.type,
    attribute: state.attribute,
    campaign: state.campaign,
  };
}

function isSameDraft(draft: SearchDraft, state: SearchState): boolean {
  return (
    draft.q.trim() === state.q.trim()
    && draft.mode === state.mode
    && draft.eliteOnly === state.eliteOnly
    && draft.type === state.type
    && draft.attribute === state.attribute
    && draft.campaign === state.campaign
    && draft.professions.length === state.professions.length
    && draft.professions.every((profession, index) => profession === state.professions[index])
  );
}

function scrollToTopIfNeeded(): void {
  if (window.scrollY > 180) {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }
}

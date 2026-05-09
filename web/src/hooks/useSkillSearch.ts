import { FormEvent, useEffect, useMemo, useState } from "react";

import { fetchSkills } from "../api/skillsApi";
import { SearchModes, type SearchMode, type SearchState, type SkillListResponse } from "../types";
import { buildUrl, getDefaultState, readStateFromUrl } from "../utils/searchUrl";

export function useSkillSearch() {
  const [state, setState] = useState<SearchState>(() => readStateFromUrl());
  const [draftQuery, setDraftQuery] = useState(state.q);
  const [response, setResponse] = useState<SkillListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCriteria =
    state.submitted || state.q.trim() !== "" || state.professions.length > 0 || state.mode !== SearchModes.All || state.eliteOnly;
  const totalPages = response ? Math.max(1, Math.ceil(response.total / response.limit)) : 1;
  const currentPage = response ? Math.floor(response.offset / response.limit) + 1 : 1;

  useEffect(() => {
    const onPopState = () => {
      const next = readStateFromUrl();
      setState(next);
      setDraftQuery(next.q);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

    fetchSkills(state, controller.signal)
      .then((data) => setResponse(data))
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
  }, [hasCriteria, state]);

  const summaryText = useMemo(() => {
    if (!hasCriteria) {
      return "Search by name, effect, profession, type, or buildcraft phrase.";
    }

    if (!response) {
      return isLoading ? "Searching..." : "";
    }

    const shownStart = response.total === 0 ? 0 : response.offset + 1;
    const shownEnd = Math.min(response.offset + response.limit, response.total);
    return `${shownStart}-${shownEnd} of ${response.total} skills`;
  }, [hasCriteria, isLoading, response]);

  function applyState(next: Partial<SearchState>) {
    const merged = { ...state, ...next };
    setState(merged);
    window.history.pushState(null, "", buildUrl(merged));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyState({ q: draftQuery.trim(), submitted: true, offset: 0 });
  }

  function resetSearch() {
    const next = getDefaultState();
    setDraftQuery("");
    setState(next);
    window.history.pushState(null, "", "/");
  }

  function clearFilters() {
    applyState({ professions: [], mode: SearchModes.All, eliteOnly: false, submitted: true, offset: 0 });
  }

  function toggleProfession(profession: string) {
    const professions = state.professions.includes(profession)
      ? state.professions.filter((item) => item !== profession)
      : [...state.professions, profession];

    applyState({ professions, offset: 0 });
  }

  function toggleMode(mode: Exclude<SearchMode, "all">) {
    applyState({ mode: state.mode === mode ? SearchModes.All : mode, offset: 0 });
  }

  function toggleEliteOnly() {
    applyState({ eliteOnly: !state.eliteOnly, offset: 0 });
  }

  function goToPreviousPage() {
    if (!response) {
      return;
    }

    applyState({ offset: Math.max(0, response.offset - response.limit) });
  }

  function goToNextPage() {
    if (!response) {
      return;
    }

    applyState({ offset: response.offset + response.limit });
  }

  return {
    currentPage,
    draftQuery,
    error,
    hasCriteria,
    isLoading,
    response,
    state,
    summaryText,
    totalPages,
    clearFilters,
    goToNextPage,
    goToPreviousPage,
    resetSearch,
    setDraftQuery,
    submitSearch,
    toggleEliteOnly,
    toggleMode,
    toggleProfession,
  };
}

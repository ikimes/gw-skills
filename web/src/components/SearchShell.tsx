import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import { SearchModes, type SearchDraft, type SearchFacetResponse } from "../types";
import { SearchFilters } from "./SearchFilters";

type SearchShellProps = {
  canReset: boolean;
  draftState: SearchDraft;
  facets: SearchFacetResponse | null;
  hasCriteria: boolean;
  hasDraftChanges: boolean;
  isLoadingFacets: boolean;
  onClearProfessions: () => void;
  summaryText: string;
  onDiscardDraftChanges: () => void;
  onDraftQueryChange: (query: string) => void;
  onResetSearch: () => void;
  onSubmit: () => void;
  onToggleAttribute: (attribute: string) => void;
  onToggleCampaign: (campaign: string) => void;
  onToggleEliteOnly: () => void;
  onToggleMode: (mode: typeof SearchModes.PveOnly | typeof SearchModes.HidePvp) => void;
  onToggleProfession: (profession: string) => void;
  onToggleType: (type: string) => void;
};

export function SearchShell({
  canReset,
  draftState,
  facets,
  hasCriteria,
  hasDraftChanges,
  isLoadingFacets,
  onClearProfessions,
  summaryText,
  onDiscardDraftChanges,
  onDraftQueryChange,
  onResetSearch,
  onSubmit,
  onToggleAttribute,
  onToggleCampaign,
  onToggleEliteOnly,
  onToggleMode,
  onToggleProfession,
  onToggleType,
}: SearchShellProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const stickyTriggerRef = useRef<HTMLDivElement | null>(null);
  const [showSticky, setShowSticky] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [stickyTriggerOffset, setStickyTriggerOffset] = useState(() => getStickyTriggerOffset());
  const filterTokens = useMemo(() => buildFilterTokens(draftState), [draftState]);
  const statusText = hasDraftChanges ? "Draft changes ready. Apply to update the current results." : summaryText;

  useEffect(() => {
    const updateStickyTriggerOffset = () => setStickyTriggerOffset(getStickyTriggerOffset());

    updateStickyTriggerOffset();
    window.addEventListener("resize", updateStickyTriggerOffset);
    return () => window.removeEventListener("resize", updateStickyTriggerOffset);
  }, []);

  useEffect(() => {
    if (!hasCriteria) {
      setShowSticky(false);
      setDrawerOpen(false);
      return;
    }

    const trigger = stickyTriggerRef.current;
    if (!trigger) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setShowSticky(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasCriteria]);

  useEffect(() => {
    if (!showSticky) {
      setDrawerOpen(false);
    }
  }, [showSticky]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDrawerOpen(false);
    onSubmit();
  }

  function handleSecondaryAction() {
    if (hasDraftChanges) {
      onDiscardDraftChanges();
      setDrawerOpen(false);
      return;
    }

    onResetSearch();
    setDrawerOpen(false);
  }

  function handleScrollToTop() {
    setDrawerOpen(false);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  return (
    <>
      <section ref={shellRef} className="search-shell" aria-labelledby="app-title">
        <p className="eyebrow">Guild Wars Reforged</p>
        <h1 id="app-title">Skill Search</h1>
        <form className="search-form" onSubmit={handleSubmit}>
          <input
            aria-label="Search skills"
            value={draftState.q}
            onChange={(event) => onDraftQueryChange(event.target.value)}
            placeholder="Search skills, effects, and build ideas"
            spellCheck={false}
          />
          <div className="search-actions">
            <button type="submit">Search</button>
            <button className="button--secondary" disabled={!canReset} type="button" onClick={handleSecondaryAction}>
              Reset
            </button>
          </div>
        </form>
        <SearchFilters
          facets={facets}
          hasDraftChanges={hasDraftChanges}
          isLoadingFacets={isLoadingFacets}
          onApply={onSubmit}
          onCancel={handleSecondaryAction}
          onClearProfessions={onClearProfessions}
          state={draftState}
          onToggleAttribute={onToggleAttribute}
          onToggleCampaign={onToggleCampaign}
          onToggleEliteOnly={onToggleEliteOnly}
          onToggleMode={onToggleMode}
          onToggleProfession={onToggleProfession}
          onToggleType={onToggleType}
        />
        <p className={hasDraftChanges ? "summary summary--pending" : "summary"}>{statusText}</p>
        <div
          ref={stickyTriggerRef}
          aria-hidden="true"
          className="search-sticky-trigger"
          style={{ "--sticky-trigger-offset": `${stickyTriggerOffset}px` } as CSSProperties}
        />
      </section>

      {showSticky ? (
        <>
          <div className="search-sticky" aria-label="Sticky search">
            <form className="search-sticky-bar" onSubmit={handleSubmit}>
              <input
                aria-label="Refine search"
                value={draftState.q}
                onChange={(event) => onDraftQueryChange(event.target.value)}
                placeholder="Refine search"
                spellCheck={false}
              />
              <div className="search-sticky-actions">
                <button type="submit">Search</button>
                <button
                  className={drawerOpen ? "button--secondary button--active" : "button--secondary"}
                  type="button"
                  onClick={() => setDrawerOpen((current) => !current)}
                >
                  Filters
                </button>
                <button className="button--secondary" type="button" onClick={handleScrollToTop}>
                  Top
                </button>
              </div>
            </form>
            <div className="search-sticky-meta">
              <div className="search-sticky-summary" aria-label="Active filters">
                {filterTokens.map((token) => (
                  <span key={token} className="search-sticky-token">{token}</span>
                ))}
              </div>
              <span className={hasDraftChanges ? "search-sticky-status search-sticky-status--pending" : "search-sticky-status"}>
                {hasDraftChanges ? "Draft changes ready" : summaryText}
              </span>
            </div>
            {drawerOpen ? (
              <div className="search-sticky-drawer">
                <SearchFilters
                  facets={facets}
                  isLoadingFacets={isLoadingFacets}
                  onClearProfessions={onClearProfessions}
                  state={draftState}
                  onToggleAttribute={onToggleAttribute}
                  onToggleCampaign={onToggleCampaign}
                  onToggleEliteOnly={onToggleEliteOnly}
                  onToggleMode={onToggleMode}
                  onToggleProfession={onToggleProfession}
                  onToggleType={onToggleType}
                />
                <div className="search-sticky-drawer-actions">
                  <button className="button--secondary" type="button" onClick={handleSecondaryAction}>
                    {hasDraftChanges ? "Cancel" : "Reset"}
                  </button>
                  <button type="button" onClick={() => {
                    setDrawerOpen(false);
                    onSubmit();
                  }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="search-sticky-spacer" aria-hidden="true" />
        </>
      ) : null}
    </>
  );
}

function getStickyTriggerOffset(): number {
  if (typeof window === "undefined") {
    return 28;
  }

  return window.innerWidth <= 720 ? Math.max(260, window.innerHeight * 0.32) : 28;
}

function buildFilterTokens(state: SearchDraft): string[] {
  const parts: string[] = [];

  if (state.professions.length === 1) {
    parts.push(state.professions[0]);
  } else if (state.professions.length > 1) {
    parts.push(`${state.professions[0]} +${state.professions.length - 1}`);
  } else {
    parts.push("All professions");
  }

  if (state.mode === SearchModes.HidePvp) {
    parts.push("Hide PvP");
  } else if (state.mode === SearchModes.PveOnly) {
    parts.push("PvE-only");
  }

  if (state.eliteOnly) {
    parts.push("Elite");
  }

  if (state.type) {
    parts.push(state.type);
  }

  if (state.attribute) {
    parts.push(state.attribute);
  }

  if (state.campaign) {
    parts.push(state.campaign);
  }

  return parts;
}

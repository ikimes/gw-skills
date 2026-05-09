import type { FormEvent } from "react";

import { SearchModes, type SearchState } from "../types";
import { SearchFilters } from "./SearchFilters";

type SearchShellProps = {
  draftQuery: string;
  hasCriteria: boolean;
  state: SearchState;
  summaryText: string;
  onClearFilters: () => void;
  onDraftQueryChange: (query: string) => void;
  onResetSearch: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleEliteOnly: () => void;
  onToggleMode: (mode: typeof SearchModes.PveOnly | typeof SearchModes.PvpUsable) => void;
  onToggleProfession: (profession: string) => void;
};

export function SearchShell({
  draftQuery,
  hasCriteria,
  state,
  summaryText,
  onClearFilters,
  onDraftQueryChange,
  onResetSearch,
  onSubmit,
  onToggleEliteOnly,
  onToggleMode,
  onToggleProfession,
}: SearchShellProps) {
  return (
    <section className="search-shell" aria-labelledby="app-title">
      <p className="eyebrow">Guild Wars Reforged</p>
      <h1 id="app-title">Skill Search</h1>
      <form className="search-form" onSubmit={onSubmit}>
        <input
          aria-label="Search skills"
          value={draftQuery}
          onChange={(event) => onDraftQueryChange(event.target.value)}
          placeholder="Search skills, effects, and build ideas"
          spellCheck={false}
        />
        <div className="search-actions">
          <button type="submit">Search</button>
          <button className="button--secondary" disabled={!hasCriteria && draftQuery.trim() === ""} type="button" onClick={onResetSearch}>
            Reset
          </button>
        </div>
      </form>
      <SearchFilters
        state={state}
        onClearFilters={onClearFilters}
        onToggleEliteOnly={onToggleEliteOnly}
        onToggleMode={onToggleMode}
        onToggleProfession={onToggleProfession}
      />
      <p className="summary">{summaryText}</p>
    </section>
  );
}

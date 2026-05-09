import { CASTER_PROFESSIONS, MARTIAL_PROFESSIONS } from "../constants";
import { SearchModes, type SearchState } from "../types";
import { FilterChip } from "./FilterChip";
import { ProfessionChip } from "./ProfessionChip";

type SearchFiltersProps = {
  state: SearchState;
  onClearFilters: () => void;
  onToggleEliteOnly: () => void;
  onToggleMode: (mode: typeof SearchModes.PveOnly | typeof SearchModes.PvpUsable) => void;
  onToggleProfession: (profession: string) => void;
};

export function SearchFilters({
  state,
  onClearFilters,
  onToggleEliteOnly,
  onToggleMode,
  onToggleProfession,
}: SearchFiltersProps) {
  const allActive = state.professions.length === 0 && state.mode === SearchModes.All && !state.eliteOnly;

  return (
    <div className="filters" aria-label="Search filters">
      <div className="profession-filter" aria-label="Profession">
        <button className={allActive ? "chip chip--all chip--active" : "chip chip--all"} type="button" onClick={onClearFilters}>
          All
        </button>
        <div className="profession-rows">
          <div className="profession-row profession-row--casters">
            {CASTER_PROFESSIONS.map((profession) => (
              <ProfessionChip
                key={profession}
                active={state.professions.includes(profession)}
                profession={profession}
                onSelect={() => onToggleProfession(profession)}
              />
            ))}
          </div>
          <div className="profession-row profession-row--martial">
            {MARTIAL_PROFESSIONS.map((profession) => (
              <ProfessionChip
                key={profession}
                active={state.professions.includes(profession)}
                profession={profession}
                onSelect={() => onToggleProfession(profession)}
              />
            ))}
          </div>
          <div className="profession-row profession-row--skill-filters">
            <FilterChip active={state.mode === SearchModes.PvpUsable} label="PvP usable" onSelect={() => onToggleMode(SearchModes.PvpUsable)} />
            <FilterChip active={state.mode === SearchModes.PveOnly} label="PvE-only" onSelect={() => onToggleMode(SearchModes.PveOnly)} />
            <FilterChip active={state.eliteOnly} label="Elite Skills" onSelect={onToggleEliteOnly} />
          </div>
        </div>
      </div>
    </div>
  );
}

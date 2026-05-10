import { useEffect, useMemo, useState } from "react";

import { ALL_PROFESSIONS } from "../constants";
import { SearchModes, type SearchDraft, type SearchFacetOption, type SearchFacetResponse } from "../types";
import { FilterChip } from "./FilterChip";
import { ProfessionChip } from "./ProfessionChip";

type SearchFiltersProps = {
  facets: SearchFacetResponse | null;
  hasDraftChanges?: boolean;
  isLoadingFacets: boolean;
  onApply?: () => void;
  onCancel?: () => void;
  onClearProfessions: () => void;
  state: SearchDraft;
  onToggleAttribute: (attribute: string) => void;
  onToggleCampaign: (campaign: string) => void;
  onToggleEliteOnly: () => void;
  onToggleMode: (mode: typeof SearchModes.PveOnly | typeof SearchModes.HidePvp) => void;
  onToggleProfession: (profession: string) => void;
  onToggleType: (type: string) => void;
};

export function SearchFilters({
  facets,
  hasDraftChanges = false,
  isLoadingFacets,
  onApply,
  onCancel,
  onClearProfessions,
  state,
  onToggleAttribute,
  onToggleCampaign,
  onToggleEliteOnly,
  onToggleMode,
  onToggleProfession,
  onToggleType,
}: SearchFiltersProps) {
  const hasAdvancedSelection = Boolean(state.type || state.attribute || state.campaign);
  const [showAdvanced, setShowAdvanced] = useState(hasAdvancedSelection);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (hasAdvancedSelection) {
      setShowAdvanced(true);
    }
  }, [hasAdvancedSelection]);

  const visibleTypeOptions = useMemo(
    () => getVisibleFacetOptions(facets?.type ?? [], state.type, expandedGroups.type),
    [expandedGroups.type, facets?.type, state.type],
  );
  const visibleAttributeOptions = useMemo(
    () => getVisibleFacetOptions(facets?.attribute ?? [], state.attribute, expandedGroups.attribute),
    [expandedGroups.attribute, facets?.attribute, state.attribute],
  );
  const visibleCampaignOptions = useMemo(
    () => getVisibleFacetOptions(facets?.campaign ?? [], state.campaign, expandedGroups.campaign, 6),
    [expandedGroups.campaign, facets?.campaign, state.campaign],
  );

  return (
    <div className="filters" aria-label="Search filters">
      <div className="profession-filter" aria-label="Profession">
        <div className="profession-rows">
          <div className="profession-actions-row" aria-hidden={state.professions.length === 0}>
            <button
              className={state.professions.length > 0 ? "profession-clear profession-clear--visible" : "profession-clear"}
              type="button"
              onClick={onClearProfessions}
            >
              Clear professions
            </button>
          </div>
          <div className="profession-grid">
            {ALL_PROFESSIONS.map((profession) => (
              <ProfessionChip
                key={profession}
                active={state.professions.includes(profession)}
                profession={profession}
                onSelect={() => onToggleProfession(profession)}
              />
            ))}
          </div>
          <div className="profession-row profession-row--skill-filters">
            <FilterChip active={state.mode === SearchModes.HidePvp} label="Hide PvP" onSelect={() => onToggleMode(SearchModes.HidePvp)} />
            <FilterChip active={state.mode === SearchModes.PveOnly} label="PvE-only" onSelect={() => onToggleMode(SearchModes.PveOnly)} />
            <FilterChip active={state.eliteOnly} label="Elite Skills" onSelect={onToggleEliteOnly} />
          </div>
          <div className="advanced-filters-toggle-row">
            <button
              aria-expanded={showAdvanced}
              className={showAdvanced ? "advanced-filters-toggle advanced-filters-toggle--active" : "advanced-filters-toggle"}
              type="button"
              onClick={() => setShowAdvanced((current) => !current)}
            >
              <span className="advanced-filters-toggle-copy">
                <span className="advanced-filters-toggle-label">{showAdvanced ? "Hide deeper filters" : "More filters"}</span>
                <span className="advanced-filters-toggle-hint">
                  {showAdvanced
                    ? "Skill type, attribute, and campaign"
                    : hasAdvancedSelection
                      ? "Draft deeper filters selected"
                      : "Filter by skill type, attribute, and campaign"}
                </span>
              </span>
              <span className="advanced-filters-toggle-indicator" aria-hidden="true">
                {showAdvanced ? "−" : "+"}
              </span>
            </button>
          </div>
          {showAdvanced ? (
            <div className="advanced-filters-panel">
              {isLoadingFacets && !facets ? <p className="advanced-filters-loading">Loading deeper filters...</p> : null}
              <FacetGroup
                expanded={expandedGroups.type}
                label="Skill type"
                options={visibleTypeOptions}
                selectedValue={state.type}
                totalOptions={facets?.type.length ?? 0}
                onSelect={onToggleType}
                onToggleExpanded={() => setExpandedGroups((current) => ({ ...current, type: !current.type }))}
              />
              <FacetGroup
                expanded={expandedGroups.attribute}
                label="Attribute"
                options={visibleAttributeOptions}
                selectedValue={state.attribute}
                totalOptions={facets?.attribute.length ?? 0}
                onSelect={onToggleAttribute}
                onToggleExpanded={() => setExpandedGroups((current) => ({ ...current, attribute: !current.attribute }))}
              />
              <FacetGroup
                expanded={expandedGroups.campaign}
                label="Campaign"
                options={visibleCampaignOptions}
                selectedValue={state.campaign}
                totalOptions={facets?.campaign.length ?? 0}
                onSelect={onToggleCampaign}
                onToggleExpanded={() => setExpandedGroups((current) => ({ ...current, campaign: !current.campaign }))}
              />
              {hasDraftChanges && onApply && onCancel ? (
                <div className="advanced-filters-actions">
                  <button className="button--secondary" type="button" onClick={onCancel}>
                    Cancel
                  </button>
                  <button type="button" onClick={onApply}>
                    Apply
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type FacetGroupProps = {
  expanded?: boolean;
  label: string;
  onSelect: (value: string) => void;
  onToggleExpanded: () => void;
  options: SearchFacetOption[];
  selectedValue?: string;
  totalOptions: number;
};

function FacetGroup({
  expanded,
  label,
  onSelect,
  onToggleExpanded,
  options,
  selectedValue,
  totalOptions,
}: FacetGroupProps) {
  if (options.length === 0) {
    return null;
  }

  const canExpand = totalOptions > options.length;

  return (
    <section className="advanced-facet-group" aria-label={label}>
      <div className="advanced-facet-header">
        <span className="advanced-facet-title">{label}</span>
        {canExpand ? (
          <button className="advanced-facet-more" type="button" onClick={onToggleExpanded}>
            {expanded ? "Show less" : `Show all ${totalOptions}`}
          </button>
        ) : null}
      </div>
      <div className="advanced-facet-options">
        {options.map((option) => (
          <FilterChip
            key={option.value}
            active={selectedValue === option.value}
            label={option.value}
            onSelect={() => onSelect(option.value)}
          />
        ))}
      </div>
    </section>
  );
}

function getVisibleFacetOptions(
  options: SearchFacetOption[],
  selectedValue: string | undefined,
  expanded: boolean | undefined,
  limit = 8,
): SearchFacetOption[] {
  if (expanded || options.length <= limit) {
    return options;
  }

  const initial = options.slice(0, limit);
  if (!selectedValue || initial.some((option) => option.value === selectedValue)) {
    return initial;
  }

  const selectedOption = options.find((option) => option.value === selectedValue);
  return selectedOption ? [...initial.slice(0, Math.max(0, limit - 1)), selectedOption] : initial;
}

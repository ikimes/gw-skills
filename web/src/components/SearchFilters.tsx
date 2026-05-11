import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ALL_PROFESSIONS } from "../constants";
import { AdvancedFilterLayouts, type AdvancedFilterLayout } from "../hooks/useAdvancedFilterLayoutPreference";
import { SearchModes, type SearchDraft, type SearchFacetOption, type SearchFacetResponse } from "../types";
import { FilterChip } from "./FilterChip";
import { ProfessionChip } from "./ProfessionChip";

type SearchFiltersProps = {
  advancedFilterLayout?: AdvancedFilterLayout;
  facets: SearchFacetResponse | null;
  hasDraftChanges?: boolean;
  isLoadingFacets: boolean;
  onApply?: () => void;
  onCancel?: () => void;
  onAdvancedFilterLayoutChange: (layout: AdvancedFilterLayout) => void;
  onClearProfessions: () => void;
  showFacetLoadingHint: boolean;
  state: SearchDraft;
  onToggleAttribute: (attribute: string) => void;
  onToggleCampaign: (campaign: string) => void;
  onToggleEliteOnly: () => void;
  onToggleMode: (mode: typeof SearchModes.PveOnly | typeof SearchModes.HidePvp) => void;
  onToggleProfession: (profession: string) => void;
  onToggleType: (type: string) => void;
};

export function SearchFilters({
  advancedFilterLayout,
  facets,
  hasDraftChanges = false,
  isLoadingFacets,
  onApply,
  onCancel,
  onAdvancedFilterLayoutChange,
  onClearProfessions,
  showFacetLoadingHint,
  state,
  onToggleAttribute,
  onToggleCampaign,
  onToggleEliteOnly,
  onToggleMode,
  onToggleProfession,
  onToggleType,
}: SearchFiltersProps) {
  const layoutToggleName = useId();
  const hasAdvancedSelection = Boolean(state.type || state.attribute || state.campaign);
  const [showAdvanced, setShowAdvanced] = useState(hasAdvancedSelection);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const prefersFacetSlideWindow = useMediaQuery("(max-width: 1040px)");
  const effectiveAdvancedFilterLayout = advancedFilterLayout ?? (
    prefersFacetSlideWindow ? AdvancedFilterLayouts.Slide : AdvancedFilterLayouts.Expand
  );
  const useFacetSlideWindow = effectiveAdvancedFilterLayout === AdvancedFilterLayouts.Slide;

  useEffect(() => {
    if (hasAdvancedSelection) {
      setShowAdvanced(true);
    }
  }, [hasAdvancedSelection]);

  const visibleTypeOptions = useMemo(
    () => getVisibleFacetOptions(facets?.type ?? [], state.type, expandedGroups.type, FACET_OPTION_LIMIT, useFacetSlideWindow),
    [expandedGroups.type, facets?.type, state.type, useFacetSlideWindow],
  );
  const visibleAttributeOptions = useMemo(
    () => getVisibleFacetOptions(facets?.attribute ?? [], state.attribute, expandedGroups.attribute, FACET_OPTION_LIMIT, useFacetSlideWindow),
    [expandedGroups.attribute, facets?.attribute, state.attribute, useFacetSlideWindow],
  );
  const visibleCampaignOptions = useMemo(
    () => getVisibleFacetOptions(
      facets?.campaign ?? [],
      state.campaign,
      expandedGroups.campaign,
      CAMPAIGN_FACET_OPTION_LIMIT,
      useFacetSlideWindow,
    ),
    [expandedGroups.campaign, facets?.campaign, state.campaign, useFacetSlideWindow],
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
                <span>{showAdvanced ? "−" : "+"}</span>
              </span>
            </button>
          </div>
          {showAdvanced ? (
            <div
              aria-busy={isLoadingFacets}
              className={isLoadingFacets ? "advanced-filters-panel advanced-filters-panel--loading" : "advanced-filters-panel"}
            >
              <div className="advanced-filters-content">
                {showFacetLoadingHint ? (
                  <div className="advanced-filters-status" aria-live="polite">
                    Updating filters
                  </div>
                ) : null}
                <fieldset className="advanced-layout-toggle" aria-label="Deeper filter layout">
                  <label className={useFacetSlideWindow ? "advanced-layout-option advanced-layout-option--active" : "advanced-layout-option"}>
                    <input
                      checked={useFacetSlideWindow}
                      name={layoutToggleName}
                      type="radio"
                      value={AdvancedFilterLayouts.Slide}
                      onChange={() => onAdvancedFilterLayoutChange(AdvancedFilterLayouts.Slide)}
                    />
                    <span>Slide</span>
                  </label>
                  <label className={!useFacetSlideWindow ? "advanced-layout-option advanced-layout-option--active" : "advanced-layout-option"}>
                    <input
                      checked={!useFacetSlideWindow}
                      name={layoutToggleName}
                      type="radio"
                      value={AdvancedFilterLayouts.Expand}
                      onChange={() => onAdvancedFilterLayoutChange(AdvancedFilterLayouts.Expand)}
                    />
                    <span>Expand</span>
                  </label>
                </fieldset>
                <FacetGroup
                  collapsedLimit={FACET_OPTION_LIMIT}
                  expanded={expandedGroups.type}
                  hideExpansionAction={isLoadingFacets}
                  isLoading={showFacetLoadingHint}
                  label="Skill type"
                  options={visibleTypeOptions}
                  selectedValue={state.type}
                  slideWindow={useFacetSlideWindow}
                  totalOptions={facets?.type.length ?? 0}
                  onSelect={onToggleType}
                  onToggleExpanded={() => setExpandedGroups((current) => ({ ...current, type: !current.type }))}
                />
                <FacetGroup
                  collapsedLimit={FACET_OPTION_LIMIT}
                  expanded={expandedGroups.attribute}
                  hideExpansionAction={isLoadingFacets}
                  isLoading={showFacetLoadingHint}
                  label="Attribute"
                  options={visibleAttributeOptions}
                  selectedValue={state.attribute}
                  slideWindow={useFacetSlideWindow}
                  totalOptions={facets?.attribute.length ?? 0}
                  onSelect={onToggleAttribute}
                  onToggleExpanded={() => setExpandedGroups((current) => ({ ...current, attribute: !current.attribute }))}
                />
                <FacetGroup
                  collapsedLimit={CAMPAIGN_FACET_OPTION_LIMIT}
                  expanded={expandedGroups.campaign}
                  hideExpansionAction={isLoadingFacets}
                  isLoading={showFacetLoadingHint}
                  label="Campaign"
                  options={visibleCampaignOptions}
                  selectedValue={state.campaign}
                  slideWindow={useFacetSlideWindow}
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
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type FacetGroupProps = {
  collapsedLimit: number;
  expanded?: boolean;
  hideExpansionAction: boolean;
  isLoading: boolean;
  label: string;
  onSelect: (value: string) => void;
  onToggleExpanded: () => void;
  options: SearchFacetOption[];
  selectedValue?: string;
  slideWindow: boolean;
  totalOptions: number;
};

function FacetGroup({
  collapsedLimit,
  expanded,
  hideExpansionAction,
  isLoading,
  label,
  onSelect,
  onToggleExpanded,
  options,
  selectedValue,
  slideWindow,
  totalOptions,
}: FacetGroupProps) {
  const optionsRef = useRef<HTMLDivElement | null>(null);
  const [scrollHintState, setScrollHintState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });

  useEffect(() => {
    if (!slideWindow) {
      setScrollHintState({ canScrollLeft: false, canScrollRight: false });
      return;
    }

    const element = optionsRef.current;
    if (!element) {
      return;
    }

    const updateScrollHint = () => {
      const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      const scrollLeft = element.scrollLeft;
      const lastOption = element.lastElementChild;
      const contentRight = lastOption instanceof HTMLElement
        ? lastOption.offsetLeft + lastOption.offsetWidth
        : element.scrollWidth;
      const contentOverflow = Math.max(0, contentRight - element.clientWidth);
      const maxContentScrollLeft = Math.min(maxScrollLeft, contentOverflow);
      const hasOverflow = maxContentScrollLeft > 6;

      setScrollHintState({
        canScrollLeft: hasOverflow && scrollLeft > 6,
        canScrollRight: hasOverflow && scrollLeft < maxContentScrollLeft - 6,
      });
    };

    updateScrollHint();

    element.addEventListener("scroll", updateScrollHint, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollHint);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", updateScrollHint);
      resizeObserver.disconnect();
    };
  }, [options.length, slideWindow, totalOptions]);

  if (options.length === 0) {
    return null;
  }

  const canToggleExpansion = totalOptions > collapsedLimit;
  const hideMoreButton = !canToggleExpansion || hideExpansionAction || slideWindow;
  const moreButtonText = expanded ? "Collapse" : `Show all ${totalOptions}`;

  return (
    <section className={slideWindow ? "advanced-facet-group advanced-facet-group--slide-window" : "advanced-facet-group"} aria-label={label}>
      <div className="advanced-facet-header">
        <span className="advanced-facet-title">
          <span className={isLoading ? "advanced-facet-loading-slot advanced-facet-loading-slot--active" : "advanced-facet-loading-slot"} aria-hidden="true">
            <span className="advanced-facet-loading-dot" />
          </span>
          {label}
        </span>
        <button
          aria-hidden={hideMoreButton}
          className={hideMoreButton ? "advanced-facet-more advanced-facet-more--hidden" : "advanced-facet-more"}
          tabIndex={hideMoreButton ? -1 : undefined}
          type="button"
          onClick={canToggleExpansion ? onToggleExpanded : undefined}
        >
          {moreButtonText}
        </button>
      </div>
      <div
        className={[
          "advanced-facet-options-window",
          scrollHintState.canScrollLeft ? "advanced-facet-options-window--left" : "",
          scrollHintState.canScrollRight ? "advanced-facet-options-window--right" : "",
        ].filter(Boolean).join(" ")}
      >
        <div ref={optionsRef} className="advanced-facet-options">
          {options.map((option) => (
            <FilterChip
              key={option.value}
              active={selectedValue === option.value}
              label={option.value}
              onSelect={() => onSelect(option.value)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function getVisibleFacetOptions(
  options: SearchFacetOption[],
  selectedValue: string | undefined,
  expanded: boolean | undefined,
  limit = FACET_OPTION_LIMIT,
  useSlideWindow = false,
): SearchFacetOption[] {
  if (useSlideWindow) {
    return options;
  }

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

const FACET_OPTION_LIMIT = 16;
const CAMPAIGN_FACET_OPTION_LIMIT = 12;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (
    typeof window === "undefined" ? false : window.matchMedia(query).matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQuery.matches);

    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);
    return () => mediaQuery.removeEventListener("change", updateMatches);
  }, [query]);

  return matches;
}

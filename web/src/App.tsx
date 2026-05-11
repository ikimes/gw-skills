import { AppFooter } from "./components/AppFooter";
import { SearchShell } from "./components/SearchShell";
import { SkillResults } from "./components/SkillResults";
import { useAdvancedFilterLayoutPreference } from "./hooks/useAdvancedFilterLayoutPreference";
import { useSkillSearch } from "./hooks/useSkillSearch";

export function App() {
  const search = useSkillSearch();
  const [advancedFilterLayout, setAdvancedFilterLayout] = useAdvancedFilterLayoutPreference();

  return (
    <main className={search.hasCriteria ? "app app--results" : "app"}>
      <SearchShell
        advancedFilterLayout={advancedFilterLayout}
        canReset={search.canReset}
        draftState={search.draftState}
        facets={search.facets}
        hasCriteria={search.hasCriteria}
        hasDraftChanges={search.hasDraftChanges}
        isLoadingFacets={search.isLoadingFacets}
        onClearProfessions={search.clearProfessions}
        showFacetLoadingHint={search.showFacetLoadingHint}
        summaryText={search.summaryText}
        onAdvancedFilterLayoutChange={setAdvancedFilterLayout}
        onDiscardDraftChanges={search.discardDraftChanges}
        onDraftQueryChange={search.setDraftQuery}
        onResetSearch={search.resetSearch}
        onSubmit={search.submitSearch}
        onToggleAttribute={search.toggleAttribute}
        onToggleCampaign={search.toggleCampaign}
        onToggleEliteOnly={search.toggleEliteOnly}
        onToggleMode={search.toggleMode}
        onToggleProfession={search.toggleProfession}
        onToggleType={search.toggleType}
      />

      {search.hasCriteria && (
        <SkillResults
          error={search.error}
          hasMore={search.hasMore}
          isLoading={search.isLoading}
          isRefreshing={search.isRefreshingResults}
          onLoadMore={search.loadMore}
          response={search.response}
        />
      )}
      <AppFooter />
    </main>
  );
}

import { SearchShell } from "./components/SearchShell";
import { SkillResults } from "./components/SkillResults";
import { useSkillSearch } from "./hooks/useSkillSearch";

export function App() {
  const search = useSkillSearch();

  return (
    <main className={search.hasCriteria ? "app app--results" : "app"}>
      <SearchShell
        canReset={search.canReset}
        draftState={search.draftState}
        facets={search.facets}
        hasCriteria={search.hasCriteria}
        hasDraftChanges={search.hasDraftChanges}
        isLoadingFacets={search.isLoadingFacets}
        onClearProfessions={search.clearProfessions}
        summaryText={search.summaryText}
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
          onLoadMore={search.loadMore}
          response={search.response}
        />
      )}
    </main>
  );
}

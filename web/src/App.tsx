import { SearchShell } from "./components/SearchShell";
import { SkillResults } from "./components/SkillResults";
import { useSkillSearch } from "./hooks/useSkillSearch";

export function App() {
  const search = useSkillSearch();

  return (
    <main className={search.hasCriteria ? "app app--results" : "app"}>
      <SearchShell
        draftQuery={search.draftQuery}
        hasCriteria={search.hasCriteria}
        state={search.state}
        summaryText={search.summaryText}
        onClearFilters={search.clearFilters}
        onDraftQueryChange={search.setDraftQuery}
        onResetSearch={search.resetSearch}
        onSubmit={search.submitSearch}
        onToggleEliteOnly={search.toggleEliteOnly}
        onToggleMode={search.toggleMode}
        onToggleProfession={search.toggleProfession}
      />

      {search.hasCriteria && (
        <SkillResults
          currentPage={search.currentPage}
          error={search.error}
          isLoading={search.isLoading}
          response={search.response}
          totalPages={search.totalPages}
          onNextPage={search.goToNextPage}
          onPreviousPage={search.goToPreviousPage}
        />
      )}
    </main>
  );
}

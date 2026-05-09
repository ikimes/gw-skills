import type { SkillListResponse } from "../types";
import { SkillRow } from "./SkillRow";

type SkillResultsProps = {
  currentPage: number;
  error: string | null;
  isLoading: boolean;
  response: SkillListResponse | null;
  totalPages: number;
  onNextPage: () => void;
  onPreviousPage: () => void;
};

export function SkillResults({
  currentPage,
  error,
  isLoading,
  response,
  totalPages,
  onNextPage,
  onPreviousPage,
}: SkillResultsProps) {
  return (
    <section className="results" aria-label="Skill results">
      {error && <div className="state-panel">{error}</div>}
      {!error && isLoading && <div className="state-panel">Searching skills...</div>}
      {!error && !isLoading && response?.results.length === 0 && <div className="state-panel">No skills matched this search.</div>}
      {!error && response && response.results.length > 0 && (
        <>
          <ol className="result-list">
            {response.results.map((skill) => (
              <SkillRow key={skill.pageId} skill={skill} />
            ))}
          </ol>
          <nav className="pager" aria-label="Pagination">
            <button type="button" disabled={response.offset === 0} onClick={onPreviousPage}>
              Previous
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button type="button" disabled={response.offset + response.limit >= response.total} onClick={onNextPage}>
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}

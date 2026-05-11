import { useEffect, useRef } from "react";

import type { SkillListResponse } from "../types";
import { SkillRow } from "./SkillRow";

type SkillResultsProps = {
  error: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  onLoadMore: () => void;
  response: SkillListResponse | null;
};

export function SkillResults({
  error,
  hasMore,
  isLoading,
  isRefreshing,
  onLoadMore,
  response,
}: SkillResultsProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingInitial = isLoading && !response;
  const isLoadingMore = isLoading && !isRefreshing && !!response && response.results.length > 0;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !response || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isLoading) {
        onLoadMore();
      }
    }, { rootMargin: "480px 0px" });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore, response]);

  return (
    <section className="results" aria-label="Skill results">
      {error && <div className="state-panel">{error}</div>}
      {!error && isLoadingInitial && <div className="state-panel">Searching skills...</div>}
      {!error && !isLoading && response?.results.length === 0 && <div className="state-panel">No skills matched this search.</div>}
      {!error && response && response.results.length > 0 && (
        <>
          <div className="result-list-wrap">
            {isRefreshing ? (
              <div className="results-refresh-badge" aria-live="polite">
                <span className="results-refresh-dot" aria-hidden="true" />
                Updating results
              </div>
            ) : null}
            <ol className={isRefreshing ? "result-list result-list--refreshing" : "result-list"}>
              {response.results.map((skill) => (
                <SkillRow key={skill.pageId} skill={skill} />
              ))}
            </ol>
          </div>
          <div className="results-status" aria-live="polite">
            {isRefreshing ? "Updating results..." : isLoadingMore ? "Loading more skills..." : hasMore ? "Scroll for more" : "End of results"}
          </div>
          {hasMore ? <div className="results-sentinel" ref={sentinelRef} aria-hidden="true" /> : null}
        </>
      )}
    </section>
  );
}

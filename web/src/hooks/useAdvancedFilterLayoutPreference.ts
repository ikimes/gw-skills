import { useEffect, useState } from "react";

export const AdvancedFilterLayouts = {
  Expand: "expand",
  Slide: "slide",
} as const;

export type AdvancedFilterLayout = typeof AdvancedFilterLayouts[keyof typeof AdvancedFilterLayouts];

const STORAGE_KEY = "gw-skills.advanced-filter-layout";

export function useAdvancedFilterLayoutPreference(): [AdvancedFilterLayout | undefined, (layout: AdvancedFilterLayout) => void] {
  const [layout, setLayoutState] = useState<AdvancedFilterLayout | undefined>(() => readStoredLayout());

  const setLayout = (nextLayout: AdvancedFilterLayout) => {
    setLayoutState(nextLayout);
    writeStoredLayout(nextLayout);
  };

  useEffect(() => {
    const syncLayout = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setLayoutState(readStoredLayout());
      }
    };

    window.addEventListener("storage", syncLayout);
    return () => window.removeEventListener("storage", syncLayout);
  }, []);

  return [layout, setLayout];
}

function readStoredLayout(): AdvancedFilterLayout | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isAdvancedFilterLayout(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredLayout(layout: AdvancedFilterLayout): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, layout);
  } catch {
    // Preference storage is nice-to-have; the in-memory selection still updates.
  }
}

function isAdvancedFilterLayout(value: string | null): value is AdvancedFilterLayout {
  return value === AdvancedFilterLayouts.Expand || value === AdvancedFilterLayouts.Slide;
}

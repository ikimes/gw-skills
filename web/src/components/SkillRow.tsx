import { useEffect, useRef, useState, type SyntheticEvent } from "react";

import type { SummarySkill } from "../types";
import { publicAssetUrl } from "../utils/publicAsset";

type SkillRowProps = {
  skill: SummarySkill;
};

type SkillDetail = {
  label: string;
  value: string;
};

type CostDetail = SkillDetail & {
  icon: string;
};

export function SkillRow({ skill }: SkillRowProps) {
  const iconUrl = skill.iconUrl;
  const details = getSkillDetails(skill);
  const costs = getCostDetails(skill);

  return (
    <li className="skill-row">
      <div className="skill-header">
        <div className="skill-header-main">
          <div className="skill-icon-wrap">
            {iconUrl ? (
              <img
                alt=""
                className="skill-icon"
                decoding="async"
                height={72}
                loading="lazy"
                src={getLocalIconUrl(skill)}
                width={72}
                onError={(event) => useFallbackIcon(event, iconUrl)}
              />
            ) : null}
          </div>
          <div className="skill-heading-block">
            <div className="skill-heading">
              <a href={skill.wiki} target="_blank" rel="noreferrer">
                {skill.name}
              </a>
            </div>
            {details.length > 0 && (
              <p className="skill-meta">
                {details.map((detail) => (
                  <span key={detail.label}>{detail.value}</span>
                ))}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="skill-main">
        <div className="skill-effect">
          <div className="skill-copy">
            <p className="skill-description">{skill.conciseDescription || skill.description || "No description available."}</p>
            {costs.length > 0 && (
              <dl className="skill-costs" aria-label={`${skill.name} costs`}>
                {costs.map((cost) => (
                  <div className="skill-cost" key={cost.label}>
                    <dt>{cost.label}</dt>
                    <dd>
                      <img alt="" className="skill-cost-icon" decoding="async" height={20} src={publicAssetUrl(`metadata-icons/${cost.icon}.png`)} width={20} />
                      <span>{cost.value}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>
      <SkillProgressionPanel skill={skill} />
    </li>
  );
}

function SkillProgressionPanel({ skill }: SkillRowProps) {
  const emphasizedRanks = new Set([0, 12, 15]);
  const hasProgression = getHasProgression(skill);
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const [scrollHintState, setScrollHintState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  useEffect(() => {
    if (!hasProgression) {
      return;
    }

    const element = columnsRef.current;
    if (!element) {
      return;
    }

    const updateScrollHint = () => {
      const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      const hasOverflow = maxScrollLeft > 6;
      const scrollLeft = element.scrollLeft;

      setScrollHintState({
        hasOverflow,
        canScrollLeft: hasOverflow && scrollLeft > 6,
        canScrollRight: hasOverflow && scrollLeft < maxScrollLeft - 6,
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
  }, [hasProgression, skill.pageId, skill.progression.columns.length, skill.progression.ranks.length]);

  if (!hasProgression) {
    return (
      <section className="skill-progression-panel skill-progression-panel--empty" aria-label={`${skill.name} progression`}>
        <div className="skill-progression-empty">
          <span>No progression</span>
          <span>{skill.progression.attribute || "No attribute"}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="skill-progression-panel" aria-label={`${skill.name} progression`}>
      <div className="skill-progression-header">
        <span className="skill-progression-title">Progression</span>
        <span className="skill-progression-attribute">{skill.progression.attribute}</span>
      </div>
      <div className="skill-progression-grid">
        <div className="skill-progression-labels" aria-hidden="true">
          <div className="skill-progression-label skill-progression-label--rank">Rank</div>
          {skill.progression.columns.map((column) => (
            <div className="skill-progression-label" key={column.key}>
              {column.name}
            </div>
          ))}
        </div>
        <div
          className={[
            "skill-progression-columns-wrap",
            scrollHintState.hasOverflow ? "skill-progression-columns-wrap--overflow" : "",
            scrollHintState.canScrollLeft ? "skill-progression-columns-wrap--left" : "",
            scrollHintState.canScrollRight ? "skill-progression-columns-wrap--right" : "",
          ].filter(Boolean).join(" ")}
        >
          <div ref={columnsRef} className="skill-progression-columns">
            {skill.progression.ranks.map((rank) => (
              <div
                className={`skill-progression-column${emphasizedRanks.has(rank.rank) ? " skill-progression-column--emphasis" : ""}`}
                key={rank.rank}
              >
                <div className="skill-progression-rank">{rank.rank}</div>
                {skill.progression.columns.map((column) => (
                  <div className="skill-progression-value" key={column.key}>
                    {formatProgressionValue(rank.values[column.key])}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function getSkillDetails(skill: SummarySkill): SkillDetail[] {
  const details: Array<SkillDetail | { label: string; value: string | undefined }> = [
    { label: "Type", value: skill.type },
    { label: "Attr", value: skill.attribute },
  ];

  if (skill.profession) {
    details.push({ label: "Profession", value: skill.profession });
    if (skill.campaign) {
      details.push({ label: "Campaign", value: skill.campaign });
    }
  } else {
    details.push({ label: "Campaign", value: skill.campaign });
  }

  return details.filter((detail): detail is { label: string; value: string } => Boolean(detail.value));
}

function getCostDetails(skill: SummarySkill): CostDetail[] {
  return [
    { icon: "adrenaline", label: "Adr", value: skill.cost.adrenaline },
    { icon: "sacrifice", label: "Sac", value: skill.cost.sacrifice },
    { icon: "energy", label: "Energy", value: skill.cost.energy },
    { icon: "activation", label: "Cast", value: skill.cost.activation },
    { icon: "recharge", label: "Rech", value: skill.cost.recharge },
    { icon: "upkeep", label: "Upkeep", value: skill.cost.upkeep },
  ]
    .filter((detail) => detail.value !== undefined)
    .map((detail) => ({ icon: detail.icon, label: detail.label, value: String(detail.value) }));
}

function getHasProgression(skill: SummarySkill): boolean {
  return skill.progression.hasProgression && skill.progression.columns.length > 0 && skill.progression.ranks.length > 0;
}

function formatProgressionValue(value: string | number | undefined): string {
  return value === undefined || value === "" ? "—" : String(value);
}

function getLocalIconUrl(skill: SummarySkill): string {
  return publicAssetUrl(`skill-icons/${skill.pageId}.jpg`);
}

function useFallbackIcon(event: SyntheticEvent<HTMLImageElement>, fallbackUrl: string) {
  const image = event.currentTarget;
  if (image.dataset.fallbackUsed !== "true") {
    image.dataset.fallbackUsed = "true";
    image.src = fallbackUrl;
    return;
  }

  image.style.display = "none";
}

import type { SyntheticEvent } from "react";

import type { SummarySkill } from "../types";

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
      <div className="skill-main">
        <div className="skill-effect">
          <p className="skill-description">{skill.conciseDescription || skill.description || "No description available."}</p>
          {costs.length > 0 && (
            <dl className="skill-costs" aria-label={`${skill.name} costs`}>
              {costs.map((cost) => (
                <div className="skill-cost" key={cost.label}>
                  <dt>{cost.label}</dt>
                  <dd>
                    <img alt="" className="skill-cost-icon" decoding="async" height={20} src={`/metadata-icons/${cost.icon}.png`} width={20} />
                    <span>{cost.value}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </li>
  );
}

function getSkillDetails(skill: SummarySkill): SkillDetail[] {
  return [
    { label: "Type", value: skill.type },
    { label: "Attr", value: skill.attribute },
    { label: "Campaign", value: skill.campaign },
  ].filter((detail): detail is { label: string; value: string } => Boolean(detail.value));
}

function getCostDetails(skill: SummarySkill): CostDetail[] {
  return [
    { icon: "energy", label: "Energy", value: skill.cost.energy },
    { icon: "adrenaline", label: "Adr", value: skill.cost.adrenaline },
    { icon: "activation", label: "Cast", value: skill.cost.activation },
    { icon: "recharge", label: "Rech", value: skill.cost.recharge },
    { icon: "upkeep", label: "Upkeep", value: skill.cost.upkeep },
    { icon: "sacrifice", label: "Sac", value: skill.cost.sacrifice },
  ]
    .filter((detail) => detail.value !== undefined)
    .map((detail) => ({ icon: detail.icon, label: detail.label, value: String(detail.value) }));
}

function getLocalIconUrl(skill: SummarySkill): string {
  return `/skill-icons/${skill.pageId}.jpg`;
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

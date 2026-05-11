import { publicAssetUrl } from "../utils/publicAsset";

type ProfessionChipProps = {
  active: boolean;
  profession: string;
  onSelect: () => void;
};

export function ProfessionChip({ active, profession, onSelect }: ProfessionChipProps) {
  const slug = profession.toLowerCase();

  return (
    <button
      className={active ? `chip chip--profession chip--${slug} chip--active` : `chip chip--profession chip--${slug}`}
      type="button"
      onClick={onSelect}
    >
      <img alt="" className="profession-icon" src={publicAssetUrl(`profession-icons/${slug}.png`)} />
      <span>{profession}</span>
    </button>
  );
}

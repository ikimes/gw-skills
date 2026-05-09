type FilterChipProps = {
  active: boolean;
  label: string;
  onSelect: () => void;
};

export function FilterChip({ active, label, onSelect }: FilterChipProps) {
  return (
    <button className={active ? "chip chip--active" : "chip"} type="button" onClick={onSelect}>
      {label}
    </button>
  );
}

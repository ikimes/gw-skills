export const CASTER_PROFESSIONS = ["Mesmer", "Necromancer", "Ritualist", "Elementalist", "Monk"] as const;
export const MARTIAL_PROFESSIONS = ["Dervish", "Assassin", "Warrior", "Ranger", "Paragon"] as const;
export const ALL_PROFESSIONS = [...CASTER_PROFESSIONS, ...MARTIAL_PROFESSIONS];
export const DEFAULT_LIMIT = 25;

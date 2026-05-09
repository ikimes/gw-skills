import Database from "better-sqlite3";
import { dirname, resolve } from "node:path";
import type { SummarySkill } from "./types.js";

export const DEFAULT_DB_PATH = resolve("data/search/skills.sqlite");
export const DEFAULT_SUMMARY_PATH = resolve("data/wiki-skills/skills.summary.json");

export type SkillDatabase = Database.Database;

export function openDatabase(dbPath = DEFAULT_DB_PATH, readonly = true): SkillDatabase {
  return new Database(dbPath, {
    fileMustExist: readonly,
    readonly,
  });
}

export function createSchema(db: SkillDatabase): void {
  db.exec(`
    PRAGMA journal_mode = DELETE;

    DROP TABLE IF EXISTS skills;
    DROP TABLE IF EXISTS skills_fts;
    DROP TABLE IF EXISTS skill_tags;

    CREATE TABLE skills (
      page_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      profession TEXT,
      attribute TEXT,
      type TEXT,
      campaign TEXT,
      game_mode TEXT NOT NULL,
      elite INTEGER NOT NULL,
      pve_only INTEGER NOT NULL,
      json TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE skills_fts USING fts5(
      page_id UNINDEXED,
      name,
      search_text,
      description,
      concise_description,
      profession,
      attribute,
      type,
      categories
    );

    CREATE TABLE skill_tags (
      page_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (page_id, kind, value),
      FOREIGN KEY (page_id) REFERENCES skills(page_id)
    );

    CREATE INDEX idx_skills_name ON skills(name);
    CREATE INDEX idx_skills_profession ON skills(profession);
    CREATE INDEX idx_skills_attribute ON skills(attribute);
    CREATE INDEX idx_skills_type ON skills(type);
    CREATE INDEX idx_skills_campaign ON skills(campaign);
    CREATE INDEX idx_skills_game_mode ON skills(game_mode);
    CREATE INDEX idx_skills_elite ON skills(elite);
    CREATE INDEX idx_skills_pve_only ON skills(pve_only);
    CREATE INDEX idx_skill_tags_kind_value ON skill_tags(kind, value);
  `);
}

export function insertSkills(db: SkillDatabase, skills: SummarySkill[]): void {
  const insertSkill = db.prepare(`
    INSERT INTO skills (
      page_id,
      name,
      profession,
      attribute,
      type,
      campaign,
      game_mode,
      elite,
      pve_only,
      json
    ) VALUES (
      @pageId,
      @name,
      @profession,
      @attribute,
      @type,
      @campaign,
      @gameMode,
      @elite,
      @pveOnly,
      @json
    )
  `);

  const insertFts = db.prepare(`
    INSERT INTO skills_fts (
      page_id,
      name,
      search_text,
      description,
      concise_description,
      profession,
      attribute,
      type,
      categories
    ) VALUES (
      @pageId,
      @name,
      @searchText,
      @description,
      @conciseDescription,
      @profession,
      @attribute,
      @type,
      @categories
    )
  `);
  const insertTag = db.prepare(`
    INSERT OR IGNORE INTO skill_tags (
      page_id,
      kind,
      value
    ) VALUES (
      @pageId,
      @kind,
      @value
    )
  `);

  const transaction = db.transaction((rows: SummarySkill[]) => {
    for (const skill of rows) {
      const values = {
        pageId: skill.pageId,
        name: skill.name,
        profession: skill.profession ?? null,
        attribute: skill.attribute ?? null,
        type: skill.type ?? null,
        campaign: skill.campaign ?? null,
        gameMode: skill.gameMode,
        elite: skill.elite ? 1 : 0,
        pveOnly: skill.pveOnly ? 1 : 0,
        json: JSON.stringify(skill),
        searchText: skill.searchText,
        description: skill.description ?? "",
        conciseDescription: skill.conciseDescription ?? "",
        categories: skill.categories.join(" "),
      };

      insertSkill.run(values);
      insertFts.run(values);
      for (const tag of getSkillTags(skill)) {
        insertTag.run({
          pageId: skill.pageId,
          kind: tag.kind,
          value: tag.value,
        });
      }
    }
  });

  transaction(skills);
}

function getSkillTags(skill: SummarySkill): Array<{ kind: string; value: string }> {
  return [
    ...skill.semantic.intents.map((value) => ({ kind: "intent", value })),
    ...skill.semantic.mechanics.map((value) => ({ kind: "mechanic", value })),
    ...skill.semantic.appliesTo.map((value) => ({ kind: "applies_to", value })),
    ...skill.areas.map((area) => ({ kind: "area", value: area.key })),
  ];
}

export function parseSkill(row: { json: string }): SummarySkill {
  return JSON.parse(row.json) as SummarySkill;
}

export function ensureParentDirectory(path: string): string {
  return dirname(resolve(path));
}

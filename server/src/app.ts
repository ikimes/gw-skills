import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { DEFAULT_DB_PATH, openDatabase, type SkillDatabase } from "./db.js";
import { getFacets, getSkillByPageId, getWeaponDamagePreset, listSkills, searchSkills } from "./search.js";
import { GameModes } from "./types.js";

type AppOptions = {
  dbPath?: string;
  db?: SkillDatabase;
};

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const ownsDb = !options.db;
  const db = options.db ?? openDatabase(options.dbPath ?? DEFAULT_DB_PATH, true);
  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: true,
  });

  app.addHook("onClose", async () => {
    if (ownsDb) {
      db.close();
    }
  });

  app.get("/health", async () => ({
    ok: true,
  }));

  app.get("/", async () => ({
    name: "Guild Wars Skills API",
    version: "0.1.0",
    health: "/health",
    endpoints: {
      skills: "/api/skills",
      skillByPageId: "/api/skills/:pageId",
      search: "/api/search",
      weaponDamagePreset: "/api/presets/weapon-damage",
      facets: "/api/facets",
    },
    examples: {
      searchWeaponDamage: "/api/search?q=weapon%20damage",
      searchPvpTouch: "/api/search?q=touch&gameMode=pvp",
      searchPveOnlyWeaponDamage: "/api/search?q=weapon%20damage&gameMode=pve_only",
      semanticWeaponDamageBuffs: "/api/search?intent=buff_weapon_damage",
      weaponDamagePreset: "/api/presets/weapon-damage",
      nearbyAreaSkills: "/api/search?area=nearby",
      filterRitualistWeaponSpells: "/api/skills?profession=Ritualist&type=Weapon%20Spell",
      facets: "/api/facets",
    },
    filters: {
      profession: "Exact profession name, e.g. Ritualist",
      attribute: "Exact attribute name, e.g. Communing or No Attribute",
      type: "Exact skill type, e.g. Weapon Spell",
      campaign: "Exact campaign name, e.g. Factions",
      gameMode: [GameModes.Default, GameModes.Pvp, GameModes.PveOnly],
      elite: ["true", "false"],
      pveOnly: ["true", "false"],
      intent: "Semantic intent, e.g. buff_weapon_damage",
      mechanic: "Semantic mechanic, e.g. flat_damage_bonus",
      appliesTo: "Semantic target/scope, e.g. weapon_attacks",
      area: "Effective area key, e.g. adjacent, nearby, in_the_area, earshot",
      limit: "1-100, default 25",
      offset: "0 or greater, default 0",
    },
  }));

  app.get("/api/skills", async (request) => listSkills(db, request.query as Record<string, unknown>));

  app.get("/api/skills/:pageId", async (request, reply) => {
    const params = request.params as { pageId: string };
    const pageId = Number(params.pageId);

    if (!Number.isInteger(pageId)) {
      return reply.code(400).send({ error: "Invalid pageId" });
    }

    const skill = getSkillByPageId(db, pageId);
    if (!skill) {
      return reply.code(404).send({ error: "Skill not found" });
    }

    return skill;
  });

  app.get("/api/search", async (request) => searchSkills(db, request.query as Record<string, unknown>));

  app.get("/api/presets/weapon-damage", async (request) => (
    getWeaponDamagePreset(db, request.query as Record<string, unknown>)
  ));

  app.get("/api/facets", async () => getFacets(db));

  return app;
}

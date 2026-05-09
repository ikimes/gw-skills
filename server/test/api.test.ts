import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importSkills } from "../scripts/import-skills.js";
import { buildApp } from "../src/app.js";
import type { SummarySkill } from "../src/types.js";

describe("skills API", () => {
  let tempDir: string;
  let dbPath: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let expectedCount = 0;
  let strengthOfHonorPageId = 0;

  beforeAll(async () => {
    tempDir = join(tmpdir(), `gw-skills-api-${Date.now()}`);
    dbPath = join(tempDir, "skills.sqlite");
    await mkdir(tempDir, { recursive: true });

    const summary = JSON.parse(await readFile("data/wiki-skills/skills.summary.json", "utf8")) as SummarySkill[];
    expectedCount = summary.length;
    strengthOfHonorPageId = summary.find((skill) => skill.name === "Strength of Honor")?.pageId ?? 0;

    await importSkills({
      output: dbPath,
    });
    app = await buildApp({ dbPath });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns health", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("imports the full summary dataset", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/skills?limit=1",
    });
    const body = response.json() as { total: number; results: SummarySkill[] };

    expect(response.statusCode).toBe(200);
    expect(body.total).toBe(expectedCount);
    expect(body.results).toHaveLength(1);
  });

  it("searches by full text", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=weapon%20damage",
    });
    const body = response.json() as { total: number; results: SummarySkill[] };

    expect(response.statusCode).toBe(200);
    expect(body.total).toBeGreaterThan(0);
    expect(body.results.length).toBeGreaterThan(0);
  });

  it("puts exact skill name searches first", async () => {
    const energySurge = await app.inject({
      method: "GET",
      url: "/api/search?q=energy%20surge&limit=10",
    });
    const deathBlossom = await app.inject({
      method: "GET",
      url: "/api/search?q=death%20blossom&limit=10",
    });
    const energySurgeBody = energySurge.json() as { results: SummarySkill[] };
    const deathBlossomBody = deathBlossom.json() as { results: SummarySkill[] };

    expect(energySurge.statusCode).toBe(200);
    expect(deathBlossom.statusCode).toBe(200);
    expect(energySurgeBody.results[0]?.name).toBe("Energy Surge");
    expect(deathBlossomBody.results[0]?.name).toBe("Death Blossom");
  });

  it("puts skill type and category concept searches before loose name matches", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=touch&limit=100",
    });
    const body = response.json() as { results: SummarySkill[] };
    const names = body.results.map((skill) => skill.name);
    const firstFifteen = body.results.slice(0, 15);
    const touchConceptResult = (skill: SummarySkill) => [
      skill.type ?? "",
      ...skill.categories,
    ].some((value) => value.toLowerCase().includes("touch"));

    expect(response.statusCode).toBe(200);
    expect(firstFifteen.every(touchConceptResult)).toBe(true);
    expect(names).toContain("\"Can't Touch This!\"");
  });

  it("requires all text query terms and lifts phrase matches", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=energy%20loss&limit=100",
    });
    const body = response.json() as { total: number; results: SummarySkill[] };
    const names = body.results.map((skill) => skill.name);
    const firstTwenty = names.slice(0, 20);

    expect(response.statusCode).toBe(200);
    expect(body.total).toBeGreaterThan(0);
    expect(names).not.toContain("Death Blossom");
    expect(firstTwenty).toContain("Energy Burn");
    expect(firstTwenty).toContain("Energy Surge");
    expect(firstTwenty).toContain("Power Leak");
  });

  it("does not split known effect concepts across unrelated fields", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=energy%20loss&profession=Mesmer&limit=100",
    });
    const body = response.json() as { results: SummarySkill[] };
    const names = body.results.map((skill) => skill.name);

    expect(response.statusCode).toBe(200);
    expect(names).toContain("Energy Burn");
    expect(names).toContain("Energy Surge");
    expect(names).toContain("Power Leak");
    expect(names).not.toContain("Illusion of Weakness");
  });

  it("filters search results by PvE-only game mode", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=weapon%20damage&gameMode=pve_only",
    });
    const body = response.json() as { results: SummarySkill[] };

    expect(response.statusCode).toBe(200);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((skill) => skill.gameMode === "pve_only")).toBe(true);
  });

  it("filters search results by PvP game mode", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=touch&gameMode=pvp",
    });
    const body = response.json() as { results: SummarySkill[] };

    expect(response.statusCode).toBe(200);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((skill) => skill.gameMode === "pvp")).toBe(true);
  });

  it("filters by multiple comma-delimited professions", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/skills?profession=Mesmer,Monk&limit=100",
    });
    const body = response.json() as { results: SummarySkill[] };

    expect(response.statusCode).toBe(200);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((skill) => skill.profession === "Mesmer" || skill.profession === "Monk")).toBe(true);
  });

  it("filters by semantic intent", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/search?intent=buff_weapon_damage&limit=100",
    });
    const body = response.json() as { results: SummarySkill[] };
    const names = body.results.map((skill) => skill.name);

    expect(response.statusCode).toBe(200);
    expect(names).toContain("Brutal Weapon");
    expect(names).toContain("Strength of Honor");
    expect(names).not.toContain("Vengeful Weapon");
  });

  it("does not let direct AoE attacks leak into the weapon damage buff text search", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/search?q=buff%20weapon%20damage&limit=100",
    });
    const body = response.json() as { results: SummarySkill[] };
    const names = body.results.map((skill) => skill.name);

    expect(response.statusCode).toBe(200);
    expect(names).toContain("Strength of Honor");
    expect(names).not.toContain("Triple Chop");
  });

  it("returns the weapon damage preset with primary results and related chips", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/presets/weapon-damage?limit=100",
    });
    const body = response.json() as {
      primary: { total: number; results: SummarySkill[] };
      chips: Array<{ key: string; total: number }>;
    };
    const names = body.primary.results.map((skill) => skill.name);
    const chipKeys = body.chips.map((chip) => chip.key);

    expect(response.statusCode).toBe(200);
    expect(body.primary.total).toBeGreaterThan(0);
    expect(names).toContain("Strength of Honor");
    expect(names).toContain("Brutal Weapon");
    expect(names).not.toContain("Splinter Weapon");
    expect(chipKeys).toEqual([
      "splash_damage",
      "health_steal",
      "arrow_damage_buff",
      "damage_type_conversion",
    ]);
    expect(body.chips.every((chip) => chip.total > 0)).toBe(true);
  });

  it("filters by effective area", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/search?area=nearby",
    });
    const body = response.json() as { results: SummarySkill[] };

    expect(response.statusCode).toBe(200);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((skill) => skill.areas.some((area) => area.key === "nearby"))).toBe(true);
  });

  it("returns a known skill by page id", async () => {
    expect(strengthOfHonorPageId).toBeGreaterThan(0);

    const response = await app.inject({
      method: "GET",
      url: `/api/skills/${strengthOfHonorPageId}`,
    });
    const body = response.json() as SummarySkill;

    expect(response.statusCode).toBe(200);
    expect(body.name).toBe("Strength of Honor");
  });

  it("returns facets for app filters", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/facets",
    });
    const body = response.json() as Record<string, Array<{ value: string | boolean; count: number }>>;

    expect(response.statusCode).toBe(200);
    expect(body.attribute.some((facet) => facet.value === "No Attribute")).toBe(true);
    expect(body.gameMode.some((facet) => facet.value === "pvp")).toBe(true);
    expect(body.intent.some((facet) => facet.value === "buff_weapon_damage")).toBe(true);
    expect(body.area.some((facet) => facet.value === "earshot")).toBe(true);
  });
});

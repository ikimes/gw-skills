import { describe, expect, it } from "vitest";

import { cleanWikiText, parseTemplateParams, readBalancedTemplate, splitFirstTopLevel, splitTopLevel } from "./wiki-skill-utils.js";

describe("wiki skill utils", () => {
  it("reads balanced nested templates", () => {
    const text = "before {{Outer|a={{Inner|x=y}}|b=2}} after";

    expect(readBalancedTemplate(text, text.indexOf("{{Outer"))).toBe("{{Outer|a={{Inner|x=y}}|b=2}}");
  });

  it("splits only at top-level delimiters", () => {
    expect(splitTopLevel("Template|a={{Inner|1|2}}|b=[[Foo|Bar]]|c=3", "|")).toEqual([
      "Template",
      "a={{Inner|1|2}}",
      "b=[[Foo|Bar]]",
      "c=3",
    ]);
    expect(splitFirstTopLevel("a={{Inner|x=y}}=kept", "=")).toEqual(["a", "{{Inner|x=y}}=kept"]);
  });

  it("parses top-level template params", () => {
    expect(parseTemplateParams("{{Skill infobox|name=[[Foo|Bar]]|desc={{gr|1|4}} damage}}")).toEqual({
      name: "[[Foo|Bar]]",
      desc: "{{gr|1|4}} damage",
    });
  });

  it("cleans wiki links, progression templates, and html entities", () => {
    expect(cleanWikiText("'''[[Foo|Bar]]''' deals {{gr|1|16}} &amp; {{sic|weird}} damage&nbsp;now")).toBe(
      "Bar deals 1...13...16 & weird [sic] damage now",
    );
  });

  it("preserves negative progression marker behavior", () => {
    expect(cleanWikiText("{{gr|1|16|-}}")).toBe("-1...13...16");
  });
});

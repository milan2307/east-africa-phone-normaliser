import fs from "node:fs";
import { describe, expect, it } from "vitest";
describe("actor core is an exact copy of the repo core", () => {
  it.each(["normalise.ts", "plans.ts"])("%s", (f) => {
    expect(fs.readFileSync(new URL(`../src/core/${f}`, import.meta.url), "utf8")).toBe(fs.readFileSync(new URL(`../../src/core/${f}`, import.meta.url), "utf8"));
  });
});

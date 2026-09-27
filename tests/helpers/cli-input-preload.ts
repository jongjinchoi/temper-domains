import "./home.ts";
import { mock } from "bun:test";
import { appendFileSync } from "node:fs";
import net from "node:net";
const mark = (value: string) => appendFileSync(`${process.env.TEMPER_TEST_HOME}/effects`, value + "\n");
mock.module("../../src/update/cli.ts", () => ({ maybeUpdate: async () => { mark("update"); return false; }, updateCommand: async () => {} }));
mock.module("ink", () => ({ render: () => { mark("render"); return { waitUntilExit: async () => {} }; } }));
// Avoid loading component imports; this test checks the real command's preflight.
for (const name of ["App", "WhoisView", "SuggestView"]) mock.module(`../../src/tui/${name}.tsx`, () => ({ default: () => null }));
mock.module("node:net", () => ({ ...net, createConnection: () => { mark("network"); throw new Error("Network forbidden"); } }));
globalThis.fetch = Object.assign(async () => { mark("network"); throw new Error("Network forbidden"); }, { preconnect() {} });

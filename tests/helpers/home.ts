import { mock } from "bun:test";
import * as os from "node:os";

const home = process.env.TEMPER_TEST_HOME;
if (!home) throw new Error("TEMPER_TEST_HOME is required for the test process");
mock.module("node:os", () => ({ ...os, homedir: () => home }));

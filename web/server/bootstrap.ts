import { createBootstrapCache } from "../../src/checker/bootstrap-cache.ts";

// Serverless adapter: same HTTP policy, no home-directory or disk writes.
const cache = createBootstrapCache();
export const getBootstrap = () => cache.get();

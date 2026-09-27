import { checkLockCleanup } from "../update/lock-cleanup.ts";

await checkLockCleanup(process.argv[2]);

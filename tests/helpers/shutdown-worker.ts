import { installShutdownHandlers } from "../../src/utils/shutdown.ts";
import { withFileTransaction } from "../../src/utils/file-transaction.ts";

const [path, mode] = process.argv.slice(2) as [string, "idle" | "held" | "stuck"];
installShutdownHandlers();
// Keep the process alive so only a signal (or the parent) ends it.
const keepAlive = setInterval(() => {}, 1000);

if (mode === "idle") console.log("READY");
else {
  await withFileTransaction(path, { subject: "Test data", deadline: Date.now() + 10000, busyMessage: "busy" }, async transaction => {
    console.log("HOLDING");
    // "held" resumes when the parent writes to stdin; "stuck" never resumes.
    if (mode === "held") await new Promise<void>(resolve => process.stdin.once("data", () => resolve()));
    else await new Promise<void>(() => {});
    await transaction.replace("new");
  });
  console.log("DONE");
}
void keepAlive;

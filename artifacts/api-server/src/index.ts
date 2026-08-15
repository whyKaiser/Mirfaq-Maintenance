import app from "./app";
import { logger } from "./lib/logger";
import { startPlanReminders } from "./lib/plan-reminders";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  logger.info({ port }, "Server listening");
  if (process.env["DISABLE_PLAN_REMINDERS"] !== "1") {
    startPlanReminders();
  }
});

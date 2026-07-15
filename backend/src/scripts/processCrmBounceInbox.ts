import "../config/env";

import { ensureTables, getAnalyticsPool } from "../services/analyticsPostgres.service";
import { processCrmBounceInbox } from "../services/crmBounceInbox.service";

type CliOptions = {
  mode: "dry-run" | "apply";
  accountEmail: string;
  folder: string;
  limit: number;
};

const DEFAULT_ACCOUNT_EMAIL = "partners@b2b.itmart24.com";
const DEFAULT_FOLDER = "INBOX";
const DEFAULT_LIMIT = 200;

const printUsageAndExit = (message?: string): never => {
  if (message) {
    console.error(message);
  }
  console.log(
    [
      "Usage:",
      "  npx ts-node --transpile-only src/scripts/processCrmBounceInbox.ts --dry-run",
      "  npx ts-node --transpile-only src/scripts/processCrmBounceInbox.ts --apply",
      "Optional:",
      "  --account-email=partners@b2b.itmart24.com",
      "  --folder=INBOX",
      "  --limit=200",
    ].join("\n")
  );
  process.exit(1);
};

const parseCliOptions = (argv: string[]): CliOptions => {
  let mode: "dry-run" | "apply" | null = null;
  let accountEmail = DEFAULT_ACCOUNT_EMAIL;
  let folder = DEFAULT_FOLDER;
  let limit = DEFAULT_LIMIT;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      mode = "dry-run";
      continue;
    }
    if (arg === "--apply") {
      mode = "apply";
      continue;
    }
    if (arg.startsWith("--account-email=")) {
      accountEmail = String(arg.split("=")[1] ?? "").trim() || DEFAULT_ACCOUNT_EMAIL;
      continue;
    }
    if (arg.startsWith("--folder=")) {
      folder = String(arg.split("=")[1] ?? "").trim() || DEFAULT_FOLDER;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const parsed = Number(arg.split("=")[1] ?? "");
      if (!Number.isFinite(parsed) || parsed <= 0) {
        printUsageAndExit("Limit must be a positive number.");
      }
      limit = Math.round(parsed);
      continue;
    }
    printUsageAndExit(`Unknown argument: ${arg}`);
  }

  if (!mode) {
    printUsageAndExit("Choose exactly one mode: --dry-run or --apply");
  }

  return {
    mode: mode as "dry-run" | "apply",
    accountEmail,
    folder,
    limit,
  };
};

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  await ensureTables();

  const result = await processCrmBounceInbox({
    accountEmail: options.accountEmail,
    folder: options.folder,
    limit: options.limit,
    mode: options.mode,
  });

  console.log(`Mode: ${result.mode}`);
  console.log(`Mailbox: ${result.accountEmail}`);
  console.log(`Folder: ${result.folder}`);
  console.log(`Message limit: ${result.limit}`);
  console.log("");
  console.log(`total inbox messages scanned: ${result.stats.totalInboxMessagesScanned}`);
  console.log(`bounce messages detected: ${result.stats.bounceMessagesDetected}`);
  console.log(`hard bounces: ${result.stats.hardBounces}`);
  console.log(`soft bounces: ${result.stats.softBounces}`);
  console.log(`technical bounces: ${result.stats.technicalBounces}`);
  console.log(`auto replies detected: ${result.stats.autoRepliesDetected}`);
  console.log(`leads matched: ${result.stats.leadsMatched}`);
  console.log(`leads not found: ${result.stats.leadsNotFound}`);
  console.log(`campaign recipients matched: ${result.stats.campaignRecipientsMatched}`);
  console.log(`updates that would be applied: ${result.stats.updatesThatWouldBeApplied}`);

  if (result.stats.alreadyProcessed > 0) {
    console.log(`already processed and skipped: ${result.stats.alreadyProcessed}`);
  }

  if (result.updates.length > 0) {
    console.log("");
    console.log("updates preview:");
    result.updates.slice(0, 25).forEach((entry, index) => {
      console.log(
        `${index + 1}. uid=${entry.uid} kind=${entry.kind} action=${entry.action} email=${entry.matchedEmail ?? "n/a"} leadId=${entry.leadId ?? "n/a"} recipientId=${entry.recipientId ?? "n/a"}`
      );
      console.log(`   subject=${entry.subject}`);
      console.log(`   reason=${entry.reason}`);
    });
  }
}

void main()
  .catch((error) => {
    console.error("processCrmBounceInbox failed:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const pool = await getAnalyticsPool().catch(() => null);
    if (pool) {
      await pool.end();
    }
  });

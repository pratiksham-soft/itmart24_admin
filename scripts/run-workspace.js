const { spawn } = require("child_process");
const { runPreflight } = require("./preflight");

const mode = process.argv[2];

if (mode !== "dev" && mode !== "staging") {
  console.error('Usage: node scripts/run-workspace.js <dev|staging>');
  process.exit(1);
}

const processes = [];
let shuttingDown = false;
let exitCode = 0;

const scriptName = mode === "staging" ? "staging" : "start";
const backendScript = mode === "staging" ? "staging" : "dev";

const commands = [
  {
    name: "backend",
    command: "npm",
    args: ["run", backendScript, "--prefix", "backend"],
  },
  {
    name: "frontend",
    command: "npm",
    args: ["run", scriptName, "--prefix", "frontend"],
  },
];

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of processes) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function startProcesses() {
  for (const entry of commands) {
    const child = spawn(entry.command, entry.args, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: true,
    });

    processes.push(child);

    child.on("exit", (code, signal) => {
      if (signal) {
        console.log(`${entry.name} stopped with signal ${signal}`);
      } else if ((code ?? 0) !== 0 && exitCode === 0) {
        exitCode = code ?? 1;
      }

      shutdown("SIGTERM");
    });

    child.on("error", (error) => {
      console.error(`Failed to start ${entry.name}:`, error.message);
      exitCode = 1;
      shutdown("SIGTERM");
    });
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

let closedCount = 0;

function watchForExit() {
  for (const child of processes) {
    child.on("close", () => {
      closedCount += 1;

      if (closedCount === processes.length) {
        process.exit(exitCode);
      }
    });
  }
}

try {
  runPreflight();
  startProcesses();
  watchForExit();
} catch (error) {
  console.error(
    `[preflight] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}

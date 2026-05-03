const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const STATE_FILE = path.join(REPO_ROOT, ".dependency-state.json");

const WORKSPACES = [
  {
    name: "root",
    cwd: REPO_ROOT,
    displayPath: ".",
    requiredPackages: [],
  },
  {
    name: "backend",
    cwd: path.join(REPO_ROOT, "backend"),
    displayPath: "backend",
    requiredPackages: ["ts-node-dev", "typescript"],
  },
  {
    name: "frontend",
    cwd: path.join(REPO_ROOT, "frontend"),
    displayPath: "frontend",
    requiredPackages: ["vite"],
  },
];

function fileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (_error) {
    return {};
  }
}

function writeState(nextState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 2));
}

function packageManifest(workspace) {
  return path.join(workspace.cwd, "package.json");
}

function readManifest(workspace) {
  const manifestPath = packageManifest(workspace);

  if (!fs.existsSync(manifestPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (_error) {
    return {};
  }
}

function lockfilePath(workspace) {
  return path.join(workspace.cwd, "package-lock.json");
}

function nodeModulesPath(workspace) {
  return path.join(workspace.cwd, "node_modules");
}

function resolvePackagePath(workspace, packageName) {
  return path.join(nodeModulesPath(workspace), packageName, "package.json");
}

function hasRequiredPackages(workspace) {
  if (!fs.existsSync(nodeModulesPath(workspace))) {
    return false;
  }

  return workspace.requiredPackages.every((packageName) =>
    fs.existsSync(resolvePackagePath(workspace, packageName))
  );
}

function currentFingerprint(workspace) {
  return {
    packageJsonHash: fileHash(packageManifest(workspace)),
    packageLockHash: fileHash(lockfilePath(workspace)),
  };
}

function hasInstallableDependencies(workspace) {
  const manifest = readManifest(workspace);

  return [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
  ].some(
    (dependencyGroup) =>
      dependencyGroup &&
      typeof dependencyGroup === "object" &&
      Object.keys(dependencyGroup).length > 0
  );
}

function installWorkspace(workspace, reason) {
  console.log(
    `[preflight] Refreshing ${workspace.name} dependencies (${reason})`
  );

  const command =
    process.platform === "win32" ? "cmd" : "npm";
  const args =
    process.platform === "win32"
      ? ["/c", "npm", "install", "--prefix", workspace.displayPath]
      : ["install", "--prefix", workspace.displayPath];

  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    const exitCode = result.status ?? 1;
    throw new Error(
      `Failed to refresh ${workspace.name} dependencies. Please run "npm install --prefix ${workspace.displayPath}" manually.`
    );
  }
}

function staleReason(workspace, previousState) {
  const fingerprint = currentFingerprint(workspace);
  const installableDependencies = hasInstallableDependencies(workspace);
  const nodeModulesExists = fs.existsSync(nodeModulesPath(workspace));
  const requiredPackagesExist = hasRequiredPackages(workspace);

  if (!installableDependencies) {
    return {
      reason: null,
      fingerprint,
      skippedInstall: true,
    };
  }

  if (!nodeModulesExists) {
    return {
      reason: "node_modules is missing",
      fingerprint,
      skippedInstall: false,
    };
  }

  if (!requiredPackagesExist) {
    return {
      reason: "required packages are missing",
      fingerprint,
      skippedInstall: false,
    };
  }

  const prior = previousState[workspace.name];

  if (!prior) {
    return {
      reason: "dependency state is not recorded yet",
      fingerprint,
      skippedInstall: false,
    };
  }

  if (prior.packageJsonHash !== fingerprint.packageJsonHash) {
    return {
      reason: "package.json changed",
      fingerprint,
      skippedInstall: false,
    };
  }

  if (prior.packageLockHash !== fingerprint.packageLockHash) {
    return {
      reason: "package-lock.json changed",
      fingerprint,
      skippedInstall: false,
    };
  }

  return {
    reason: null,
    fingerprint,
    skippedInstall: false,
  };
}

function ensureWorkspaceDependencies(workspace, previousState, nextState) {
  const { reason, skippedInstall } = staleReason(workspace, previousState);

  if (reason) {
    installWorkspace(workspace, reason);
  } else if (skippedInstall) {
    console.log(
      `[preflight] ${workspace.name} has no installable dependencies to refresh`
    );
  } else {
    console.log(`[preflight] ${workspace.name} dependencies are up to date`);
  }

  nextState[workspace.name] = currentFingerprint(workspace);
}

function runPreflight() {
  const previousState = readState();
  const nextState = {};

  for (const workspace of WORKSPACES) {
    ensureWorkspaceDependencies(workspace, previousState, nextState);
  }

  writeState(nextState);
}

module.exports = {
  runPreflight,
};

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

export const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(BACKEND_ROOT, "..");
const APP_ENV_CONFIG_PATH = path.join(
  REPO_ROOT,
  "app.environment.json"
);

type AppEnvironment = "development" | "production";

function normalizeEnvironment(
  value?: string
): AppEnvironment | null {
  if (!value) {
    return null;
  }

  if (value === "development" || value === "staging") {
    return "development";
  }

  if (value === "production") {
    return "production";
  }

  return null;
}

function readAppEnvironmentFile(): AppEnvironment {
  if (!fs.existsSync(APP_ENV_CONFIG_PATH)) {
    return "development";
  }

  const parsedConfig = JSON.parse(
    fs.readFileSync(APP_ENV_CONFIG_PATH, "utf8")
  ) as {
    environment?: string;
  };
  const environment = normalizeEnvironment(
    parsedConfig.environment
  );

  if (!environment) {
    throw new Error(
      `Invalid environment in ${APP_ENV_CONFIG_PATH}. Use "development" or "production".`
    );
  }

  return environment;
}

export const APP_ENV =
  readAppEnvironmentFile() ??
  normalizeEnvironment(process.env.APP_ENV) ??
  normalizeEnvironment(process.env.NODE_ENV);

export const NODE_ENV =
  process.env.NODE_ENV ??
  (APP_ENV === "production" ? "production" : "development");

process.env.APP_ENV = APP_ENV;
process.env.NODE_ENV = NODE_ENV;

const envFiles = [
  path.join(BACKEND_ROOT, `.env.${APP_ENV}`),
  path.join(BACKEND_ROOT, `.env.${NODE_ENV}`),
  APP_ENV === "development"
    ? path.join(BACKEND_ROOT, ".env.staging")
    : null,
  path.join(BACKEND_ROOT, ".env"),
].filter((envFile): envFile is string => Boolean(envFile));

for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  }
}

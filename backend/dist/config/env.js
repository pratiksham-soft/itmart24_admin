"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NODE_ENV = exports.APP_ENV = exports.BACKEND_ROOT = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
exports.BACKEND_ROOT = path_1.default.resolve(__dirname, "..", "..");
const REPO_ROOT = path_1.default.resolve(exports.BACKEND_ROOT, "..");
const APP_ENV_CONFIG_PATH = path_1.default.join(REPO_ROOT, "app.environment.json");
function normalizeEnvironment(value) {
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
function readAppEnvironmentFile() {
    if (!fs_1.default.existsSync(APP_ENV_CONFIG_PATH)) {
        return "development";
    }
    const parsedConfig = JSON.parse(fs_1.default.readFileSync(APP_ENV_CONFIG_PATH, "utf8"));
    const environment = normalizeEnvironment(parsedConfig.environment);
    if (!environment) {
        throw new Error(`Invalid environment in ${APP_ENV_CONFIG_PATH}. Use "development" or "production".`);
    }
    return environment;
}
exports.APP_ENV = normalizeEnvironment(process.env.APP_ENV) ??
    normalizeEnvironment(process.env.NODE_ENV) ??
    readAppEnvironmentFile();
exports.NODE_ENV = process.env.NODE_ENV ??
    (exports.APP_ENV === "production" ? "production" : "development");
const envFiles = [
    path_1.default.join(exports.BACKEND_ROOT, `.env.${exports.APP_ENV}`),
    path_1.default.join(exports.BACKEND_ROOT, `.env.${exports.NODE_ENV}`),
    exports.APP_ENV === "development"
        ? path_1.default.join(exports.BACKEND_ROOT, ".env.staging")
        : null,
    path_1.default.join(exports.BACKEND_ROOT, ".env"),
].filter((envFile) => Boolean(envFile));
for (const envFile of envFiles) {
    if (fs_1.default.existsSync(envFile)) {
        dotenv_1.default.config({ path: envFile });
    }
}

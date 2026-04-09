"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.firestore = exports.firebaseApp = void 0;
require("./env");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./env");
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required Firebase env variable: ${name}`);
    }
    return value;
}
function resolveCredentialsPath(credentialsPath) {
    return path_1.default.isAbsolute(credentialsPath)
        ? credentialsPath
        : path_1.default.resolve(env_1.BACKEND_ROOT, credentialsPath);
}
const projectId = requireEnv("FIREBASE_PROJECT_ID");
const credentialsPath = resolveCredentialsPath(requireEnv("GOOGLE_APPLICATION_CREDENTIALS"));
if (!fs_1.default.existsSync(credentialsPath)) {
    throw new Error(`Firebase service account file not found at: ${credentialsPath}`);
}
const serviceAccount = JSON.parse(fs_1.default.readFileSync(credentialsPath, "utf8"));
if (serviceAccount.project_id &&
    serviceAccount.project_id !== projectId) {
    throw new Error(`FIREBASE_PROJECT_ID (${projectId}) does not match the service account project_id (${serviceAccount.project_id}).`);
}
exports.firebaseApp = firebase_admin_1.default.apps.length
    ? firebase_admin_1.default.app()
    : firebase_admin_1.default.initializeApp({
        credential: firebase_admin_1.default.credential.cert(serviceAccount),
        projectId,
    });
exports.firestore = firebase_admin_1.default.firestore(exports.firebaseApp);
exports.default = firebase_admin_1.default;

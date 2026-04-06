"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.firestore = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const serviceAccountPath = path_1.default.join(process.cwd(), "firebase-service-account.json");
const serviceAccount = JSON.parse(fs_1.default.readFileSync(serviceAccountPath, "utf8"));
if (!firebase_admin_1.default.apps.length) {
    firebase_admin_1.default.initializeApp({
        credential: firebase_admin_1.default.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id, // 👈 IMPORTANT
    });
}
console.log("🔥 Backend connected to Firebase project:", firebase_admin_1.default.app().options.projectId);
exports.firestore = firebase_admin_1.default.firestore();

import "./env";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { BACKEND_ROOT } from "./env";

type ServiceAccountJson = admin.ServiceAccount & {
  project_id?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required Firebase env variable: ${name}`);
  }

  return value;
}

function resolveCredentialsPath(credentialsPath: string): string {
  return path.isAbsolute(credentialsPath)
    ? credentialsPath
    : path.resolve(BACKEND_ROOT, credentialsPath);
}

const projectId = requireEnv("FIREBASE_PROJECT_ID");
const credentialsPath = resolveCredentialsPath(
  requireEnv("GOOGLE_APPLICATION_CREDENTIALS")
);

if (!fs.existsSync(credentialsPath)) {
  throw new Error(
    `Firebase service account file not found at: ${credentialsPath}`
  );
}

const serviceAccount = JSON.parse(
  fs.readFileSync(credentialsPath, "utf8")
) as ServiceAccountJson;

if (
  serviceAccount.project_id &&
  serviceAccount.project_id !== projectId
) {
  throw new Error(
    `FIREBASE_PROJECT_ID (${projectId}) does not match the service account project_id (${serviceAccount.project_id}).`
  );
}

export const firebaseApp = admin.apps.length
  ? admin.app()
  : admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });

export const firestore = admin.firestore(firebaseApp);
export default admin;

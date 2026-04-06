import admin from "firebase-admin";
import path from "path";

// Prevent re-initialization in dev / hot reload
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      path.join(
        process.cwd(),
        "firebase-service-account.json"
      )
    ),
  });
}

export const firestore = admin.firestore();
export default admin;

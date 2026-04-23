import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type UserCredential,
} from "firebase/auth";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import firebaseApp from "../config/firebase";

export const ADMINS_COLLECTION = "admins";

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

type SignUpAdminPayload = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

type SignInAdminPayload = {
  email: string;
  password: string;
  rememberMe: boolean;
};

export async function signUpAdmin({
  firstName,
  lastName,
  email,
  password,
}: SignUpAdminPayload): Promise<UserCredential> {
  await setPersistence(auth, browserSessionPersistence);

  const credential = await createUserWithEmailAndPassword(auth, email, password);

  try {
    await setDoc(doc(db, ADMINS_COLLECTION, credential.user.uid), {
      uid: credential.user.uid,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
      email: credential.user.email ?? email,
      role: "admin",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    try {
      await deleteUser(credential.user);
    } catch {
      // Keep the original Firestore failure as the surfaced error.
    }
    throw error;
  }

  return credential;
}

export async function signInAdmin({
  email,
  password,
  rememberMe,
}: SignInAdminPayload): Promise<UserCredential> {
  await setPersistence(
    auth,
    rememberMe ? browserLocalPersistence : browserSessionPersistence
  );

  const credential = await signInWithEmailAndPassword(auth, email, password);
  const adminRecord = await getDoc(doc(db, ADMINS_COLLECTION, credential.user.uid));

  if (!adminRecord.exists()) {
    await signOut(auth);
    throw new Error("This account does not have access to the ITMart24 admin workspace.");
  }

  return credential;
}

export function getAuthErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Something went wrong. Please try again.";
  }

  if (!("code" in error) || typeof error.code !== "string") {
    return error.message || "Something went wrong. Please try again.";
  }

  switch (error.code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/weak-password":
      return "Use at least 8 characters with letters and numbers.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Invalid email or password.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact an administrator.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email/password authentication is not enabled for this Firebase project.";
    default:
      return error.message || "Something went wrong. Please try again.";
  }
}

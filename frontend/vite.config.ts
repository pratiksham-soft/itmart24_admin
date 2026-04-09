import fs from "fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

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

function readAppEnvironment(): AppEnvironment {
  const configPath = path.resolve(
    __dirname,
    "..",
    "app.environment.json"
  );

  if (!fs.existsSync(configPath)) {
    return "development";
  }

  const parsedConfig = JSON.parse(
    fs.readFileSync(configPath, "utf8")
  ) as {
    environment?: string;
  };
  const environment = normalizeEnvironment(
    parsedConfig.environment
  );

  if (!environment) {
    throw new Error(
      `Invalid environment in ${configPath}. Use "development" or "production".`
    );
  }

  return environment;
}

function loadFirebaseEnvironment(
  environment: AppEnvironment
) {
  const envFile = path.resolve(
    __dirname,
    `.env.${environment}`
  );

  if (!fs.existsSync(envFile)) {
    throw new Error(`Missing frontend env file: ${envFile}`);
  }

  return loadEnv(environment, __dirname, "");
}

const activeEnvironment =
  normalizeEnvironment(process.env.APP_ENV) ??
  readAppEnvironment();
const firebaseEnv = loadFirebaseEnvironment(
  activeEnvironment
);

// https://vite.dev/config/
export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_ENV": JSON.stringify(
      activeEnvironment
    ),
    "import.meta.env.VITE_FIREBASE_API_KEY": JSON.stringify(
      firebaseEnv.VITE_FIREBASE_API_KEY ?? ""
    ),
    "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN": JSON.stringify(
      firebaseEnv.VITE_FIREBASE_AUTH_DOMAIN ?? ""
    ),
    "import.meta.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify(
      firebaseEnv.VITE_FIREBASE_PROJECT_ID ?? ""
    ),
    "import.meta.env.VITE_FIREBASE_STORAGE_BUCKET": JSON.stringify(
      firebaseEnv.VITE_FIREBASE_STORAGE_BUCKET ?? ""
    ),
    "import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID": JSON.stringify(
      firebaseEnv.VITE_FIREBASE_MESSAGING_SENDER_ID ?? ""
    ),
    "import.meta.env.VITE_FIREBASE_APP_ID": JSON.stringify(
      firebaseEnv.VITE_FIREBASE_APP_ID ?? ""
    ),
    "import.meta.env.VITE_FIREBASE_MEASUREMENT_ID": JSON.stringify(
      firebaseEnv.VITE_FIREBASE_MEASUREMENT_ID ?? ""
    ),
  },
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

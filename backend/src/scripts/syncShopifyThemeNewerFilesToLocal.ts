import "../config/env";

import fs from "node:fs/promises";
import path from "node:path";

import { shopifyRest } from "../services/shopifyHttp";

const THEME_ROOT = "D:\\IT MART24\\System_Programs\\shopify_theme";
const SCOPED_DIRECTORIES = ["layout", "sections", "snippets", "templates"] as const;

type ShopifyTheme = {
  id: number;
  role?: string;
};

type ThemeAssetListItem = {
  key: string;
  updated_at?: string;
};

type ThemeAssetResponse = {
  asset?: {
    key: string;
    value?: string;
    updated_at?: string;
  };
};

type SyncResult = {
  key: string;
  status:
    | "pulled_server_newer"
    | "pushed_local_newer"
    | "kept_local_newer"
    | "unchanged_same_content"
    | "skipped_same_or_older_server"
    | "created_from_server"
    | "missing_on_server";
  serverUpdatedAt?: string;
  localUpdatedAt?: string;
};

const isScopedAsset = (assetKey: string) =>
  SCOPED_DIRECTORIES.some((directory) => assetKey.startsWith(`${directory}/`));

const toAssetPath = (assetKey: string) => path.join(THEME_ROOT, ...assetKey.split("/"));

const ensureDirectory = async (filePath: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const getLiveThemeId = async () => {
  const response = await shopifyRest.get<{ themes: ShopifyTheme[] }>("/themes.json");
  const liveTheme = response.data.themes.find((theme) => theme.role === "main");

  if (!liveTheme?.id) {
    throw new Error("Live Shopify theme not found.");
  }

  return liveTheme.id;
};

const listRemoteAssets = async (themeId: number) => {
  const response = await shopifyRest.get<{ assets: ThemeAssetListItem[] }>(
    `/themes/${themeId}/assets.json`
  );

  return Array.isArray(response.data.assets)
    ? response.data.assets.filter((asset) => isScopedAsset(asset.key))
    : [];
};

const readLocalFileIfPresent = async (filePath: string) => {
  try {
    const [value, stats] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs.stat(filePath),
    ]);

    return {
      value,
      updatedAt: stats.mtime.toISOString(),
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const fetchRemoteAsset = async (themeId: number, assetKey: string) => {
  const response = await shopifyRest.get<ThemeAssetResponse>(`/themes/${themeId}/assets.json`, {
    params: {
      "asset[key]": assetKey,
    },
  });

  return response.data.asset;
};

const syncAsset = async (
  themeId: number,
  asset: ThemeAssetListItem
): Promise<SyncResult> => {
  const assetPath = toAssetPath(asset.key);
  const localFile = await readLocalFileIfPresent(assetPath);
  const remoteAsset = await fetchRemoteAsset(themeId, asset.key);

  if (!remoteAsset?.value) {
    return {
      key: asset.key,
      status: "missing_on_server",
      serverUpdatedAt: remoteAsset?.updated_at ?? asset.updated_at,
      localUpdatedAt: localFile?.updatedAt,
    };
  }

  const serverUpdatedAt = remoteAsset.updated_at ?? asset.updated_at;
  const localUpdatedAt = localFile?.updatedAt;

  if (!localFile) {
    await ensureDirectory(assetPath);
    await fs.writeFile(assetPath, remoteAsset.value, "utf8");
    return {
      key: asset.key,
      status: "created_from_server",
      serverUpdatedAt,
    };
  }

  if (localFile.value === remoteAsset.value) {
    return {
      key: asset.key,
      status: "unchanged_same_content",
      serverUpdatedAt,
      localUpdatedAt,
    };
  }

  const serverTime = serverUpdatedAt ? Date.parse(serverUpdatedAt) : Number.NaN;
  const localTime = localUpdatedAt ? Date.parse(localUpdatedAt) : Number.NaN;

  if (!Number.isNaN(serverTime) && !Number.isNaN(localTime) && serverTime > localTime) {
    await fs.writeFile(assetPath, remoteAsset.value, "utf8");
    return {
      key: asset.key,
      status: "pulled_server_newer",
      serverUpdatedAt,
      localUpdatedAt,
    };
  }

  if (!Number.isNaN(serverTime) && !Number.isNaN(localTime) && localTime > serverTime) {
    await shopifyRest.put(`/themes/${themeId}/assets.json`, {
      asset: {
        key: asset.key,
        value: localFile.value,
      },
    });

    return {
      key: asset.key,
      status: "pushed_local_newer",
      serverUpdatedAt,
      localUpdatedAt,
    };
  }

  return {
    key: asset.key,
    status: "skipped_same_or_older_server",
    serverUpdatedAt,
    localUpdatedAt,
  };
};

const main = async () => {
  const themeId = await getLiveThemeId();
  const remoteAssets = await listRemoteAssets(themeId);
  const results: SyncResult[] = [];

  for (const asset of remoteAssets) {
    results.push(await syncAsset(themeId, asset));
  }

  const summary = results.reduce<Record<SyncResult["status"], number>>(
    (accumulator, result) => {
      accumulator[result.status] += 1;
      return accumulator;
    },
    {
      pulled_server_newer: 0,
      pushed_local_newer: 0,
      kept_local_newer: 0,
      unchanged_same_content: 0,
      skipped_same_or_older_server: 0,
      created_from_server: 0,
      missing_on_server: 0,
    }
  );

  console.log(JSON.stringify({ themeId, summary, results }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

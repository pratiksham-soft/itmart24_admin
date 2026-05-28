import { getAnalyticsPool } from "./analyticsPostgres.service";

const HEADER_ACCOUNT_ICON_SETTING_KEY = "shopify_header_account_icon_settings";

type StoredHeaderAccountIconSettings = {
  clickEnabled?: unknown;
  updatedByAdminId?: unknown;
  updatedByAdminEmail?: unknown;
  updatedAt?: unknown;
};

export type HeaderAccountIconSettings = {
  clickEnabled: boolean;
  updatedByAdminId: number | null;
  updatedByAdminEmail: string | null;
  updatedAt: string | null;
};

const toBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const toNullableNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNullableString = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const normalizeStoredSettings = (
  settings: StoredHeaderAccountIconSettings | null | undefined
): HeaderAccountIconSettings => ({
  clickEnabled: toBoolean(settings?.clickEnabled, true),
  updatedByAdminId: toNullableNumber(settings?.updatedByAdminId),
  updatedByAdminEmail: toNullableString(settings?.updatedByAdminEmail),
  updatedAt: toNullableString(settings?.updatedAt),
});

const loadStoredSettings = async () => {
  const pool = await getAnalyticsPool();
  const result = await pool.query(
    `
      SELECT setting_value
      FROM admin_settings
      WHERE setting_key = $1
      LIMIT 1
    `,
    [HEADER_ACCOUNT_ICON_SETTING_KEY]
  );

  const row = result.rows[0] as
    | { setting_value?: StoredHeaderAccountIconSettings }
    | undefined;

  return normalizeStoredSettings(row?.setting_value);
};

export const getHeaderAccountIconSettings =
  async (): Promise<HeaderAccountIconSettings> => loadStoredSettings();

export const getPublicHeaderAccountIconSettings = async () => {
  const settings = await loadStoredSettings();

  return {
    clickEnabled: settings.clickEnabled,
    updatedAt: settings.updatedAt,
  };
};

export const updateHeaderAccountIconSettings = async (input: {
  clickEnabled?: unknown;
  updatedByAdminId?: number | null;
  updatedByAdminEmail?: string | null;
}) => {
  const current = await loadStoredSettings();
  const nextSettings: HeaderAccountIconSettings = {
    clickEnabled:
      typeof input.clickEnabled === "boolean"
        ? input.clickEnabled
        : current.clickEnabled,
    updatedByAdminId:
      typeof input.updatedByAdminId === "number"
        ? input.updatedByAdminId
        : current.updatedByAdminId,
    updatedByAdminEmail:
      typeof input.updatedByAdminEmail === "string"
        ? input.updatedByAdminEmail
        : current.updatedByAdminEmail,
    updatedAt: new Date().toISOString(),
  };

  const pool = await getAnalyticsPool();
  await pool.query(
    `
      INSERT INTO admin_settings (
        setting_key,
        setting_value,
        created_at,
        updated_at
      )
      VALUES ($1, $2::jsonb, NOW(), NOW())
      ON CONFLICT (setting_key)
      DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_at = NOW()
    `,
    [HEADER_ACCOUNT_ICON_SETTING_KEY, JSON.stringify(nextSettings)]
  );

  return nextSettings;
};

import { getAnalyticsPool } from "./analyticsPostgres.service";

export type AIProvider = "openai" | "groq_replicate";

type StoredAiProviderSettings = {
  provider?: unknown;
  groqApiKey?: unknown;
  replicateApiToken?: unknown;
  fallbackToOpenai?: unknown;
};

export type AIProviderSettings = {
  provider: AIProvider;
  groqApiKey: string | null;
  replicateApiToken: string | null;
  fallbackToOpenai: boolean;
};

export type PublicAIProviderSettings = {
  provider: AIProvider;
  groqApiKeyConfigured: boolean;
  groqApiKeyPreview: string | null;
  replicateApiTokenConfigured: boolean;
  replicateApiTokenPreview: string | null;
  fallbackToOpenai: boolean;
};

const AI_PROVIDER_SETTING_KEY = "ai_provider_configuration";
const VALID_AI_PROVIDERS = new Set<AIProvider>(["openai", "groq_replicate"]);

const toTrimmedString = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
};

const toProvider = (value: unknown): AIProvider =>
  VALID_AI_PROVIDERS.has(value as AIProvider)
    ? (value as AIProvider)
    : "openai";

const toBoolean = (value: unknown) => value === true;

const maskSecret = (value: string | null) => {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
};

const normalizeStoredSettings = (
  settings: StoredAiProviderSettings | null | undefined
): AIProviderSettings => ({
  provider: toProvider(settings?.provider),
  groqApiKey: toTrimmedString(settings?.groqApiKey),
  replicateApiToken: toTrimmedString(settings?.replicateApiToken),
  fallbackToOpenai: toBoolean(settings?.fallbackToOpenai),
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
    [AI_PROVIDER_SETTING_KEY]
  );

  const row = result.rows[0] as { setting_value?: StoredAiProviderSettings } | undefined;
  return normalizeStoredSettings(row?.setting_value);
};

export const getAIProvider = async (): Promise<AIProvider> => {
  const settings = await loadStoredSettings();
  return settings.provider;
};

export const getAIProviderSettings = async (): Promise<AIProviderSettings> =>
  loadStoredSettings();

export const getAIProviderRuntimeConfig = async () => {
  const settings = await loadStoredSettings();

  return {
    provider: settings.provider,
    groqApiKey: settings.groqApiKey || toTrimmedString(process.env.GROQ_API_KEY),
    replicateApiToken:
      settings.replicateApiToken ||
      toTrimmedString(process.env.REPLICATE_API_TOKEN),
    fallbackToOpenai:
      settings.fallbackToOpenai ||
      ["1", "true", "yes", "on"].includes(
        String(process.env.AI_PROVIDER_FALLBACK_TO_OPENAI ?? "")
          .trim()
          .toLowerCase()
      ),
  };
};

export const getPublicAIProviderSettings =
  async (): Promise<PublicAIProviderSettings> => {
    const settings = await loadStoredSettings();

    return {
      provider: settings.provider,
      groqApiKeyConfigured: Boolean(settings.groqApiKey),
      groqApiKeyPreview: maskSecret(settings.groqApiKey),
      replicateApiTokenConfigured: Boolean(settings.replicateApiToken),
      replicateApiTokenPreview: maskSecret(settings.replicateApiToken),
      fallbackToOpenai: settings.fallbackToOpenai,
    };
  };

export const updateAIProviderSettings = async (payload: {
  provider?: unknown;
  groqApiKey?: unknown;
  replicateApiToken?: unknown;
  fallbackToOpenai?: unknown;
}) => {
  const current = await loadStoredSettings();
  const provider = toProvider(payload.provider);
  const nextGroqApiKey =
    typeof payload.groqApiKey === "string" ? toTrimmedString(payload.groqApiKey) : undefined;
  const nextReplicateApiToken =
    typeof payload.replicateApiToken === "string"
      ? toTrimmedString(payload.replicateApiToken)
      : undefined;
  const groqApiKey =
    nextGroqApiKey === undefined ? current.groqApiKey : nextGroqApiKey || current.groqApiKey;
  const replicateApiToken =
    nextReplicateApiToken === undefined
      ? current.replicateApiToken
      : nextReplicateApiToken || current.replicateApiToken;
  const fallbackToOpenai =
    typeof payload.fallbackToOpenai === "boolean"
      ? payload.fallbackToOpenai
      : current.fallbackToOpenai;

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
    [
      AI_PROVIDER_SETTING_KEY,
      JSON.stringify({
        provider,
        groqApiKey,
        replicateApiToken,
        fallbackToOpenai,
      }),
    ]
  );

  return getPublicAIProviderSettings();
};

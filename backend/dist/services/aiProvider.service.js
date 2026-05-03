"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAIProviderSettings = exports.getPublicAIProviderSettings = exports.getAIProviderRuntimeConfig = exports.getAIProviderSettings = exports.getAIProvider = void 0;
const analyticsPostgres_service_1 = require("./analyticsPostgres.service");
const AI_PROVIDER_SETTING_KEY = "ai_provider_configuration";
const VALID_AI_PROVIDERS = new Set(["openai", "groq_replicate"]);
const toTrimmedString = (value) => {
    const normalized = String(value ?? "").trim();
    return normalized ? normalized : null;
};
const toProvider = (value) => VALID_AI_PROVIDERS.has(value)
    ? value
    : "openai";
const toBoolean = (value) => value === true;
const maskSecret = (value) => {
    if (!value) {
        return null;
    }
    if (value.length <= 8) {
        return `${value.slice(0, 2)}***${value.slice(-2)}`;
    }
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
};
const normalizeStoredSettings = (settings) => ({
    provider: toProvider(settings?.provider),
    groqApiKey: toTrimmedString(settings?.groqApiKey),
    replicateApiToken: toTrimmedString(settings?.replicateApiToken),
    fallbackToOpenai: toBoolean(settings?.fallbackToOpenai),
});
const loadStoredSettings = async () => {
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    const result = await pool.query(`
      SELECT setting_value
      FROM admin_settings
      WHERE setting_key = $1
      LIMIT 1
    `, [AI_PROVIDER_SETTING_KEY]);
    const row = result.rows[0];
    return normalizeStoredSettings(row?.setting_value);
};
const getAIProvider = async () => {
    const settings = await loadStoredSettings();
    return settings.provider;
};
exports.getAIProvider = getAIProvider;
const getAIProviderSettings = async () => loadStoredSettings();
exports.getAIProviderSettings = getAIProviderSettings;
const getAIProviderRuntimeConfig = async () => {
    const settings = await loadStoredSettings();
    return {
        provider: settings.provider,
        groqApiKey: settings.groqApiKey || toTrimmedString(process.env.GROQ_API_KEY),
        replicateApiToken: settings.replicateApiToken ||
            toTrimmedString(process.env.REPLICATE_API_TOKEN),
        fallbackToOpenai: settings.fallbackToOpenai ||
            ["1", "true", "yes", "on"].includes(String(process.env.AI_PROVIDER_FALLBACK_TO_OPENAI ?? "")
                .trim()
                .toLowerCase()),
    };
};
exports.getAIProviderRuntimeConfig = getAIProviderRuntimeConfig;
const getPublicAIProviderSettings = async () => {
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
exports.getPublicAIProviderSettings = getPublicAIProviderSettings;
const updateAIProviderSettings = async (payload) => {
    const current = await loadStoredSettings();
    const provider = toProvider(payload.provider);
    const nextGroqApiKey = typeof payload.groqApiKey === "string" ? toTrimmedString(payload.groqApiKey) : undefined;
    const nextReplicateApiToken = typeof payload.replicateApiToken === "string"
        ? toTrimmedString(payload.replicateApiToken)
        : undefined;
    const groqApiKey = nextGroqApiKey === undefined ? current.groqApiKey : nextGroqApiKey || current.groqApiKey;
    const replicateApiToken = nextReplicateApiToken === undefined
        ? current.replicateApiToken
        : nextReplicateApiToken || current.replicateApiToken;
    const fallbackToOpenai = typeof payload.fallbackToOpenai === "boolean"
        ? payload.fallbackToOpenai
        : current.fallbackToOpenai;
    const pool = await (0, analyticsPostgres_service_1.getAnalyticsPool)();
    await pool.query(`
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
    `, [
        AI_PROVIDER_SETTING_KEY,
        JSON.stringify({
            provider,
            groqApiKey,
            replicateApiToken,
            fallbackToOpenai,
        }),
    ]);
    return (0, exports.getPublicAIProviderSettings)();
};
exports.updateAIProviderSettings = updateAIProviderSettings;

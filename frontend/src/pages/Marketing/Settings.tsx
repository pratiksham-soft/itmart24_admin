import { useEffect, useState } from "react";
import ComponentCard from "../../components/common/ComponentCard";
import Button from "../../components/ui/button/Button";
import InputField from "../../components/form/input/InputField";
import Label from "../../components/form/Label";
import Radio from "../../components/form/input/Radio";
import {
  fetchAIProviderSettings,
  updateAIProviderSettings,
} from "../../services/blogManager.service";
import type { AIProviderSettings } from "../../types/blogManager";

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AIProviderSettings | null>(null);
  const [provider, setProvider] = useState<"openai" | "groq_replicate">("openai");
  const [groqApiKey, setGroqApiKey] = useState("");
  const [replicateApiToken, setReplicateApiToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchAIProviderSettings();
        setSettings(response);
        setProvider(response.provider);
      } catch (requestError: any) {
        setError(
          requestError?.response?.data?.error ??
            "Failed to load AI provider settings."
        );
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      const updated = await updateAIProviderSettings({
        provider,
        groqApiKey: provider === "groq_replicate" ? groqApiKey : undefined,
        replicateApiToken:
          provider === "groq_replicate" ? replicateApiToken : undefined,
      });
      setSettings(updated);
      setProvider(updated.provider);
      setGroqApiKey("");
      setReplicateApiToken("");
      setSuccessMessage("AI provider settings saved successfully.");
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.error ??
          "Failed to save AI provider settings."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
          Marketing Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choose which AI backend powers blog content and image generation.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      <ComponentCard
        title="AI Provider Configuration"
        desc="Switch between the existing OpenAI flow and the new Groq plus Replicate backend."
      >
        {loading ? (
          <div className="text-sm text-gray-500">Loading settings...</div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-3">
              <Radio
                id="provider-openai"
                name="ai-provider"
                value="openai"
                checked={provider === "openai"}
                label="OpenAI API"
                onChange={(value) =>
                  setProvider(value as "openai" | "groq_replicate")
                }
              />
              <Radio
                id="provider-groq-replicate"
                name="ai-provider"
                value="groq_replicate"
                checked={provider === "groq_replicate"}
                label="Groq + Replicate"
                onChange={(value) =>
                  setProvider(value as "openai" | "groq_replicate")
                }
              />
            </div>

            {provider === "groq_replicate" ? (
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <Label htmlFor="groq-api-key">GROQ_API_KEY</Label>
                  <InputField
                    id="groq-api-key"
                    type="password"
                    value={groqApiKey}
                    onChange={(event) => setGroqApiKey(event.target.value)}
                    placeholder="Enter Groq API key"
                    hint={
                      settings?.groqApiKeyConfigured
                        ? `Saved key on file: ${settings.groqApiKeyPreview}`
                        : "No saved Groq API key yet."
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="replicate-api-token">REPLICATE_API_TOKEN</Label>
                  <InputField
                    id="replicate-api-token"
                    type="password"
                    value={replicateApiToken}
                    onChange={(event) => setReplicateApiToken(event.target.value)}
                    placeholder="Enter Replicate API token"
                    hint={
                      settings?.replicateApiTokenConfigured
                        ? `Saved token on file: ${settings.replicateApiTokenPreview}`
                        : "No saved Replicate token yet."
                    }
                  />
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </ComponentCard>
    </div>
  );
};

export default Settings;

import { useEffect, useState } from "react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import ComponentCard from "../../components/common/ComponentCard";
import Switch from "../../components/form/switch/Switch";
import Button from "../../components/ui/button/Button";
import {
  fetchHeaderAccountIconSettings,
  updateHeaderAccountIconSettings,
} from "../../services/userSettings.service";

export default function UserSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clickEnabled, setClickEnabled] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const settings = await fetchHeaderAccountIconSettings();
        if (!isMounted) {
          return;
        }

        setClickEnabled(Boolean(settings.clickEnabled));
        setUpdatedAt(settings.updatedAt ?? null);
        setInitialLoaded(true);
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error && loadError.message
              ? loadError.message
              : "Failed to load user settings."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);
      const settings = await updateHeaderAccountIconSettings(clickEnabled);
      setClickEnabled(Boolean(settings.clickEnabled));
      setUpdatedAt(settings.updatedAt ?? null);
      setSuccessMessage("User header settings saved successfully.");
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : "Failed to save user settings."
      );
    } finally {
      setSaving(false);
    }
  };

  const formattedUpdatedAt = updatedAt
    ? new Date(updatedAt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not updated yet";

  return (
    <>
      <PageMeta
        title="User Settings | ITMart24 Admin"
        description="Manage storefront user interaction settings."
      />
      <PageBreadcrumb pageTitle="User Settings" />

      <div className="space-y-6">
        {error ? (
          <div className="rounded-2xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-2xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-600">
            {successMessage}
          </div>
        ) : null}

        <ComponentCard
          title="Shopify Header User Icon"
          desc="Control whether the user icon in the Shopify storefront header can redirect users to the portal."
        >
          {loading && !initialLoaded ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Loading settings...
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-5 dark:border-gray-800 dark:bg-gray-900/40 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    Enable user icon click
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    When disabled, the Shopify header keeps showing the user icon and blocks portal redirection.
                  </div>
                </div>
                <Switch
                  key={clickEnabled ? "enabled" : "disabled"}
                  label={clickEnabled ? "Enabled" : "Disabled"}
                  defaultChecked={clickEnabled}
                  onChange={(checked) => setClickEnabled(checked)}
                />
              </div>

              <div className="text-sm text-gray-500 dark:text-gray-400">
                Last updated: {formattedUpdatedAt}
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </div>
          )}
        </ComponentCard>
      </div>
    </>
  );
}

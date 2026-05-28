import { useId } from "react";
import type { CountryPricing } from "./types";
import {
  calculateDiscountedPrice,
  COUNTRY_PRESETS,
  createCountryPricingDraft,
  formatMoney,
  getCountryPresetByValue,
} from "./pricingConfig";

type CountryPricingEditorProps = {
  title?: string;
  description?: string;
  items: CountryPricing[];
  onChange: (items: CountryPricing[]) => void;
};

const CountryPricingEditor = ({
  title = "Country overrides",
  description = "Set local price and discount for specific markets while keeping one global fallback.",
  items,
  onChange,
}: CountryPricingEditorProps) => {
  const datalistId = useId();

  const updateItem = (
    itemId: string,
    field: keyof CountryPricing,
    value: string | number
  ) => {
    onChange(
      items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    );
  };

  const handleCountryChange = (itemId: string, rawValue: string) => {
    const preset = getCountryPresetByValue(rawValue);

    onChange(
      items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        return {
          ...item,
          countryCode: preset?.code ?? item.countryCode ?? "",
          countryName: preset?.name ?? rawValue,
          currencyCode: preset?.currency ?? item.currencyCode ?? "USD",
        };
      })
    );
  };

  const addItem = () => {
    onChange([...items, createCountryPricingDraft()]);
  };

  const removeItem = (itemId: string) => {
    onChange(items.filter((item) => item.id !== itemId));
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
            {title}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {description}
          </p>
        </div>

        <button
          type="button"
          onClick={addItem}
          className="inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          + Add Country
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white/80 px-4 py-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
          No country-specific pricing yet. The global price above will be used everywhere.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item, index) => {
            const effectivePrice = calculateDiscountedPrice(
              item.price,
              item.discountPercentage
            );

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-white bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-gray-900/60"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                      Market {index + 1}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Effective price {formatMoney(effectivePrice, item.currencyCode)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-xs font-semibold text-red-600 transition hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Country
                    </label>
                    <input
                      list={datalistId}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      placeholder="United States"
                      value={item.countryName}
                      onChange={(event) =>
                        handleCountryChange(item.id, event.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Country Code
                    </label>
                    <input
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm uppercase text-gray-800 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      placeholder="US"
                      maxLength={3}
                      value={item.countryCode ?? ""}
                      onChange={(event) =>
                        updateItem(item.id, "countryCode", event.target.value.toUpperCase())
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Currency
                    </label>
                    <input
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm uppercase text-gray-800 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      placeholder="USD"
                      maxLength={6}
                      value={item.currencyCode}
                      onChange={(event) =>
                        updateItem(item.id, "currencyCode", event.target.value.toUpperCase())
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Local Price
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      placeholder="0"
                      value={item.price}
                      onChange={(event) =>
                        updateItem(item.id, "price", Number(event.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,220px)_1fr]">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Discount %
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                      placeholder="0"
                      value={item.discountPercentage ?? 0}
                      onChange={(event) =>
                        updateItem(item.id, "discountPercentage", Number(event.target.value))
                      }
                    />
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <span className="font-semibold">Live preview:</span>{" "}
                    {formatMoney(item.price, item.currencyCode)} with{" "}
                    {item.discountPercentage ?? 0}% off becomes{" "}
                    {formatMoney(effectivePrice, item.currencyCode)}.
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <datalist id={datalistId}>
        {COUNTRY_PRESETS.map((preset) => (
          <option key={preset.code} value={preset.name}>
            {preset.code} - {preset.currency}
          </option>
        ))}
      </datalist>
    </div>
  );
};

export default CountryPricingEditor;

import { calculateDiscountedPrice, formatMoney } from "./pricingConfig";
import { SubscriptionPlan } from "./types";

type Props = {
  plan: SubscriptionPlan;
  projectLabel: string;
  onClose: () => void;
};

const PlanView = ({ plan, projectLabel, onClose }: Props) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <div className="flex h-full w-full max-w-[560px] flex-col overflow-hidden bg-white shadow-2xl dark:bg-gray-900">
          <div className="border-b border-gray-200 bg-gradient-to-r from-slate-50 via-white to-sky-50 px-6 py-5 dark:border-white/[0.08] dark:from-gray-900 dark:via-gray-900 dark:to-slate-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-500">
                  {projectLabel} Plan Overview
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {plan.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                  {plan.description ? (
                    <p className="max-w-md text-sm text-gray-600 dark:text-gray-400">
                      {plan.description}
                    </p>
                  ) : <div />}
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900 dark:border-white/[0.08] dark:text-gray-300 dark:hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-900 dark:border-white/[0.08] dark:text-gray-300 dark:hover:text-white"
              >
                Close
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                Billing setup
              </p>
              <div className="mt-4 space-y-4">
                {plan.periods.map((period) => {
                  const effectiveGlobalPrice = calculateDiscountedPrice(
                    period.price,
                    period.discountPercentage
                  );

                  return (
                    <div
                      key={period.id}
                      className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.02]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {period.label}
                          </p>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {period.durationInMonths} months
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-semibold text-gray-900 dark:text-white">
                            {formatMoney(effectiveGlobalPrice, "USD")}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Global after {period.discountPercentage ?? 0}% discount
                          </p>
                        </div>
                      </div>

                      {(period.countryPricing?.length ?? 0) > 0 ? (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            Country Overrides
                          </p>
                          {period.countryPricing?.map((market) => (
                            <div
                              key={market.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2 text-sm dark:border-white/[0.06] dark:bg-gray-950"
                            >
                              <div>
                                <span className="font-medium text-gray-800 dark:text-white/90">
                                  {market.countryName}
                                </span>
                                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                  {market.currencyCode}
                                </span>
                              </div>
                              <span className="font-medium text-gray-800 dark:text-white/90">
                                {formatMoney(
                                  calculateDiscountedPrice(
                                    market.price,
                                    market.discountPercentage
                                  ),
                                  market.currencyCode
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                Features
              </p>
              <div className="mt-4 space-y-3">
                {plan.features.map((feature, index) => (
                  <div
                    key={`${feature.title}-${index}`}
                    className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.02]"
                  >
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {feature.title}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanView;

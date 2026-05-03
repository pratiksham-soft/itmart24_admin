import { useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { MoreDotIcon } from "../../icons";
import CountryMap from "./CountryMap";
import type { DashboardCountryDistribution } from "../../types/dashboard";

type DemographicCardProps = {
  countries: DashboardCountryDistribution[];
  isLoading: boolean;
  error: string | null;
};

const COUNTRY_COORDINATES: Record<string, [number, number]> = {
  "United States": [37.0902, -95.7129],
  India: [20.5937, 78.9629],
  "United Kingdom": [55.3781, -3.436],
  Germany: [51.1657, 10.4515],
  France: [46.2276, 2.2137],
  Canada: [56.1304, -106.3468],
  Australia: [-25.2744, 133.7751],
  "United Arab Emirates": [23.4241, 53.8478],
  Singapore: [1.3521, 103.8198],
};

export default function DemographicCard({
  countries,
  isLoading,
  error,
}: DemographicCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  const topCountries = countries.slice(0, 5);
  const markers = topCountries
    .filter((country) => COUNTRY_COORDINATES[country.country])
    .map((country) => ({
      name: country.country,
      latLng: COUNTRY_COORDINATES[country.country],
    }));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="flex justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Vendor Demographic
          </h3>
          <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
            Vendor profile distribution by country.
          </p>
        </div>
        <div className="relative inline-block">
          <button className="dropdown-toggle" onClick={toggleDropdown}>
            <MoreDotIcon className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 size-6" />
          </button>
          <Dropdown
            isOpen={isOpen}
            onClose={closeDropdown}
            className="w-40 p-2"
          >
            <DropdownItem
              onItemClick={closeDropdown}
              className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              Country mix
            </DropdownItem>
          </Dropdown>
        </div>
      </div>
      <div className="px-4 py-6 my-6 overflow-hidden border border-gary-200 rounded-2xl dark:border-gray-800 sm:px-6">
        <div
          id="mapOne"
          className="mapOne map-btn -mx-4 -my-6 h-[212px] w-[252px] 2xsm:w-[307px] xsm:w-[358px] sm:-mx-6 md:w-[668px] lg:w-[634px] xl:w-[393px] 2xl:w-[554px]"
        >
          <CountryMap markers={markers} />
        </div>
      </div>

      <div className="space-y-5">
        {isLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Loading geography mix...
          </p>
        ) : error ? (
          <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
        ) : topCountries.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No vendor geography data is available yet.
          </p>
        ) : (
          topCountries.map((country) => (
            <div
              key={country.country}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-500 dark:bg-brand-500/10 dark:text-brand-300">
                  {country.country.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-800 text-theme-sm dark:text-white/90">
                    {country.country}
                  </p>
                  <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                    {country.count} vendor{country.count === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div className="flex w-full max-w-[140px] items-center gap-3">
                <div className="relative block h-2 w-full max-w-[100px] rounded-sm bg-gray-200 dark:bg-gray-800">
                  <div
                    className="absolute left-0 top-0 flex h-full items-center justify-center rounded-sm bg-brand-500 text-xs font-medium text-white"
                    style={{ width: `${Math.min(100, country.share)}%` }}
                  ></div>
                </div>
                <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                  {country.share.toFixed(0)}%
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

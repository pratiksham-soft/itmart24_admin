import { useState } from "react";
import { Link } from "react-router";

type AuthBrandProps = {
  align?: "left" | "center";
  subtitle: string;
};

export default function AuthBrand({
  align = "left",
  subtitle,
}: AuthBrandProps) {
  const [logoSrc, setLogoSrc] = useState("/itmart-logo.png");
  const isCentered = align === "center";

  return (
    <div className={isCentered ? "text-center" : "text-left"}>
      <Link
        to="/"
        className={`inline-flex items-center gap-3 ${
          isCentered ? "justify-center" : ""
        }`}
      >
        <img
          src={logoSrc}
          alt="ITMart24"
          className="h-12 w-12 rounded-2xl object-contain ring-1 ring-gray-200 dark:ring-white/10"
          onError={() => {
            if (logoSrc !== "/images/logo/itmart-logo.png") {
              setLogoSrc("/images/logo/itmart-logo.png");
            }
          }}
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-500">
            ITMart24
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Admin Portal
          </h1>
        </div>
      </Link>
      <p className="mt-4 text-sm leading-6 text-gray-500 dark:text-gray-400">
        {subtitle}
      </p>
    </div>
  );
}

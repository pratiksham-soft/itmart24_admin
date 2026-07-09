import fs from "fs";
import path from "path";
import "../config/env";
import { BACKEND_ROOT } from "../config/env";
import { DIGITAL_SERVICES_CATEGORY } from "./lib/digitalServicesCatalog";

type TimestampRecord = {
  _type: "timestamp";
  seconds: number;
  nanoseconds: number;
  iso: string;
};

type ThemeFinalCategory = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isDeleted: boolean;
  order: number;
  createdAt?: TimestampRecord;
  updatedAt?: TimestampRecord;
};

type ThemeSubcategory = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isDeleted: boolean;
  order: number;
  createdAt?: TimestampRecord;
  updatedAt?: TimestampRecord;
  _subcollections: {
    subsubcategories: ThemeFinalCategory[];
  };
};

type ThemeMainCategory = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isDeleted: boolean;
  order: number;
  createdAt?: TimestampRecord;
  updatedAt?: TimestampRecord;
  _subcollections: {
    subcategories: ThemeSubcategory[];
  };
};

const themeSourcePath = path.resolve(
  BACKEND_ROOT,
  "..",
  "..",
  "shopify_theme",
  "assets",
  "product_categories.json"
);

const buildTimestampRecord = (): TimestampRecord => {
  const now = new Date();
  return {
    _type: "timestamp",
    seconds: Math.floor(now.getTime() / 1000),
    nanoseconds: now.getMilliseconds() * 1_000_000,
    iso: now.toISOString(),
  };
};

const nextCreatedTimestamp = () => buildTimestampRecord();
const nextUpdatedTimestamp = () => buildTimestampRecord();

const ensureThemeMainCategory = (
  existing: ThemeMainCategory | undefined,
  topOrder: number
): ThemeMainCategory => {
  const createdAt = existing?.createdAt ?? nextCreatedTimestamp();
  const updatedAt = nextUpdatedTimestamp();
  const subcategories = DIGITAL_SERVICES_CATEGORY.subcategories.map(
    (subcategory, subIndex) => {
      const existingSubcategory = existing?._subcollections?.subcategories?.find(
        (item) => item.slug === subcategory.slug
      );
      const subCreatedAt = existingSubcategory?.createdAt ?? nextCreatedTimestamp();
      const subUpdatedAt = nextUpdatedTimestamp();

      const finalCategories = subcategory.finalCategories.map(
        (finalCategory, finalIndex) => {
          const existingFinalCategory =
            existingSubcategory?._subcollections?.subsubcategories?.find(
              (item) => item.slug === finalCategory.slug
            );

          return {
            id:
              existingFinalCategory?.id ??
              `digital-services__${subcategory.slug}__${finalCategory.slug}`,
            name: finalCategory.name,
            slug: finalCategory.slug,
            isActive: true,
            isDeleted: false,
            order: (subIndex + 1) * 100 + finalIndex + 1,
            createdAt: existingFinalCategory?.createdAt ?? nextCreatedTimestamp(),
            updatedAt: nextUpdatedTimestamp(),
          };
        }
      );

      return {
        id:
          existingSubcategory?.id ??
          `digital-services__${subcategory.slug}`,
        name: subcategory.name,
        slug: subcategory.slug,
        isActive: true,
        isDeleted: false,
        order: (subIndex + 1) * 100,
        createdAt: subCreatedAt,
        updatedAt: subUpdatedAt,
        _subcollections: {
          subsubcategories: finalCategories,
        },
      };
    }
  );

  return {
    id: existing?.id ?? DIGITAL_SERVICES_CATEGORY.slug,
    name: DIGITAL_SERVICES_CATEGORY.name,
    slug: DIGITAL_SERVICES_CATEGORY.slug,
    isActive: true,
    isDeleted: false,
    order: existing?.order ?? topOrder,
    createdAt,
    updatedAt,
    _subcollections: {
      subcategories,
    },
  };
};

const source = JSON.parse(
  fs.readFileSync(themeSourcePath, "utf8").replace(/^\uFEFF/, "")
) as ThemeMainCategory[];

const existingIndex = source.findIndex(
  (category) => category.slug === DIGITAL_SERVICES_CATEGORY.slug
);
const maxOrder = source.reduce(
  (currentMax, category) =>
    Math.max(currentMax, Number(category?.order) || 0),
  0
);
const nextOrder = maxOrder + 1;
const existing = existingIndex >= 0 ? source[existingIndex] : undefined;
const digitalServicesCategory = ensureThemeMainCategory(existing, nextOrder);

if (existingIndex >= 0) {
  source[existingIndex] = digitalServicesCategory;
} else {
  source.push(digitalServicesCategory);
}

fs.writeFileSync(themeSourcePath, `${JSON.stringify(source, null, 4)}\n`, "utf8");

console.log(
  existingIndex >= 0
    ? "Updated Digital Services category in shopify theme source."
    : "Added Digital Services category to shopify theme source."
);

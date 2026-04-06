import { useEffect, useMemo, useState } from "react";
import Badge from "../../components/ui/badge/Badge";
import { Modal } from "../../components/ui/modal";

type ProductDetailsModalProps = {
  isOpen: boolean;
  productId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
};

type TimestampLike =
  | { _seconds?: number; _nanoseconds?: number }
  | string
  | number
  | null
  | undefined;

type ProductDetails = {
  id: string;
  vendorId?: string;
  businessName?: string | null;
  claimedByBusinessName?: string | null;
  source?: string;
  lifecycleStatus?: string;
  ownership?: Record<string, any>;
  linkVerification?: Record<string, any>;
  vendor?: Record<string, any>;
  shopify?: Record<string, any>;
  media?: Record<string, any>;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  [key: string]: any;
};

type LinkItem = { label: string; url: string };
type MediaItem = { label: string; url: string };
type PlanRow = {
  name?: string;
  introPrice?: string | number;
  introTerm?: string;
  renewalPrice?: string | number;
  renewalTerm?: string;
  type?: string;
  [key: string]: unknown;
};
type SubSubCategory = { id: string; name: string; isActive?: boolean };
type SubCategory = {
  id: string;
  name: string;
  isActive?: boolean;
  subsubcategories?: SubSubCategory[];
};
type MainCategory = {
  id: string;
  name: string;
  isActive?: boolean;
  subcategories?: SubCategory[];
};
type TabId =
  | "overview"
  | "catalog"
  | "media"
  | "pricing"
  | "verification"
  | "shopify";

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "catalog", label: "Catalog" },
  { id: "media", label: "Media" },
  { id: "pricing", label: "Pricing" },
  { id: "verification", label: "Verification" },
  { id: "shopify", label: "Shopify" },
];

const inputClass =
  "w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const productNamePaths = ["vendor.basic.productName", "shopify.product.title"];
const descriptionPaths = ["vendor.basic.description", "shopify.product.descriptionHtml"];
const categoryPaths = ["vendor.basic.categoryName", "vendor.basic.category", "shopify.product.category"];
const subCategoryPaths = ["vendor.basic.subCategoryName"];
const selectedPlanPaths = ["vendor.productPlanPricing.selectedPlan", "vendor.pricing.selectedPlan", "shopify.shopifyData.metafields.plan"];
const pricePaths = ["vendor.productPlanPricing.price", "vendor.pricing.price", "shopify.shopifyData.variants.0.price"];
const affiliatePaths = ["vendor.productPlanPricing.affiliateUrl", "vendor.pricing.affiliateUrl"];
const productTypePaths = ["shopify.product.productType"];
const shopifyUrlPaths = ["shopify.identifiers.shopifyProductURL", "shopifyProductURL", "shopify.shopifyProductURL"];
const handlePaths = ["shopify.identifiers.handle", "shopify.product.handle"];
const shopifyProductIdPaths = ["shopify.identifiers.productId", "shopify.productId"];
const graphQlIdPaths = ["shopify.identifiers.graphqlId"];
const subSubCategoryPaths = ["vendor.basic.subSubCategories"];

const ProductDetailsModal = ({
  isOpen,
  productId,
  onClose,
  onUpdated,
}: ProductDetailsModalProps) => {
  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [draft, setDraft] = useState<ProductDetails | null>(null);
  const [categories, setCategories] = useState<MainCategory[]>([]);
  const [jsonDraft, setJsonDraft] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !productId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const response = await fetch(`http://localhost:5000/api/products/${productId}`);
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to fetch product details");
        }

        const normalized = normalizeProduct(result.data);
        if (!cancelled) {
          setProduct(normalized);
          setDraft(normalized);
          setJsonDraft(JSON.stringify(normalized, null, 2));
          setActiveTab("overview");
          setEditing(false);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to fetch product details"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, productId]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadCategories = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/product-categories");
        if (!response.ok) {
          throw new Error("Failed to fetch categories");
        }
        const result = await response.json();
        if (!cancelled) {
          setCategories(Array.isArray(result) ? result : []);
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
        }
      }
    };

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setProduct(null);
      setDraft(null);
      setCategories([]);
      setJsonDraft("");
      setActiveTab("overview");
      setEditing(false);
      setLoading(false);
      setSaving(false);
      setMessage(null);
      setError(null);
    }
  }, [isOpen]);

  const record = editing ? draft : product;

  const title =
    text(getResolvedValue(record, productNamePaths, productNamePaths[0])) ||
    "Unnamed Product";
  const category =
    text(getResolvedValue(record, categoryPaths, categoryPaths[1])) ||
    "Not available";
  const selectedPlan =
    text(getResolvedValue(record, selectedPlanPaths, selectedPlanPaths[1])) ||
    "Not available";
  const updatedAt =
    record?.vendor?.metadata?.updatedAt ??
    record?.shopify?.updatedAt ??
    record?.updatedAt;

  const links = useMemo(() => collectLinks(record), [record]);
  const media = useMemo(() => collectMedia(record), [record]);
  const headerLinks = links.slice(0, 4);
  const heroMedia = media[0]?.url ?? null;
  const features = useMemo(() => normalizeFeatures(record?.vendor?.features), [record]);
  const keywords = useMemo(
    () => normalizeTextArray(record?.vendor?.basic?.keywords),
    [record]
  );
  const tags = useMemo(
    () => normalizeTextArray(record?.shopify?.product?.tags),
    [record]
  );
  const plans = useMemo(
    () =>
      normalizePlans(
        getResolvedValue(
          record,
          ["vendor.productPlanPricing.plans", "vendor.pricing.plans"],
          "vendor.pricing.plans"
        )
      ),
    [record]
  );
  const selectedMainCategory = useMemo(
    () => findMainCategory(categories, text(getResolvedValue(record, categoryPaths, categoryPaths[1]))),
    [categories, record]
  );
  const selectedSubCategory = useMemo(
    () =>
      findSubCategory(
        selectedMainCategory,
        text(getResolvedValue(record, subCategoryPaths, subCategoryPaths[0]))
      ),
    [record, selectedMainCategory]
  );
  const selectedSubSubCategoryNames = useMemo(
    () => normalizeSubSubCategoryNames(getResolvedValue(record, subSubCategoryPaths, subSubCategoryPaths[0])),
    [record]
  );
  const claimedByDisplay =
    record?.claimedByBusinessName ||
    record?.ownership?.claimedByBusinessName ||
    text(record?.ownership?.claimedByVendorId) ||
    "Not available";

  const setValue = (path: string, value: unknown) => {
    setDraft((prev) => (prev ? setPath(prev, path.split("."), value) : prev));
    setMessage(null);
    setError(null);
  };

  const setResolvedValue = (
    candidates: string[],
    fallback: string,
    value: unknown
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const path = resolvePath(prev, candidates, fallback);
      return setPath(prev, path.split("."), value);
    });
    setMessage(null);
    setError(null);
  };

  const setPlans = (nextPlans: PlanRow[]) => {
    const path = resolvePath(
      draft ?? product,
      ["vendor.productPlanPricing.plans", "vendor.pricing.plans"],
      "vendor.pricing.plans"
    );
    setValue(path, nextPlans);
  };

  const updatePlan = (index: number, key: keyof PlanRow, value: string) => {
    const nextPlans = plans.map((plan, planIndex) =>
      planIndex === index ? { ...plan, [key]: value } : plan
    );
    setPlans(nextPlans);
  };

  const addPlanRow = () => {
    setPlans([
      ...plans,
      {
        name: "",
        introPrice: "",
        introTerm: "",
        renewalPrice: "",
        renewalTerm: "",
        type: "",
      },
    ]);
  };

  const removePlanRow = (index: number) => {
    setPlans(plans.filter((_, planIndex) => planIndex !== index));
  };

  const handleMainCategoryChange = (value: string) => {
    const mainCategory = findMainCategory(categories, value);
    const name = mainCategory?.name ?? value;
    setValue("vendor.basic.category", name);
    setValue("vendor.basic.categoryName", name);
    setResolvedValue(subCategoryPaths, subCategoryPaths[0], "");
    setValue("vendor.basic.subSubCategories", []);
  };

  const handleSubCategoryChange = (value: string) => {
    const subCategory = findSubCategory(selectedMainCategory, value);
    const name = subCategory?.name ?? value;
    setResolvedValue(subCategoryPaths, subCategoryPaths[0], name);
    setValue("vendor.basic.subSubCategories", []);
  };

  const handleSubSubCategoryChange = (values: string[]) => {
    const options = selectedSubCategory?.subsubcategories ?? [];
    const nextValue = values.map((entry) => {
      const match = options.find((item) => sameName(item.name, entry));
      return {
        id: match?.id ?? slugify(entry),
        name: match?.name ?? entry,
        isActive: match?.isActive ?? true,
      };
    });
    setValue("vendor.basic.subSubCategories", nextValue);
  };

  const beginEditing = () => {
    if (!product) return;
    const normalized = normalizeProduct(product);
    setDraft(normalized);
    setJsonDraft(JSON.stringify(normalized, null, 2));
    setEditing(true);
    setMessage(null);
    setError(null);
  };

  const cancelEditing = () => {
    if (!product) return;
    const normalized = normalizeProduct(product);
    setDraft(normalized);
    setJsonDraft(JSON.stringify(normalized, null, 2));
    setEditing(false);
    setMessage(null);
    setError(null);
  };

  const applyRawJson = () => {
    try {
      const parsed = normalizeProduct(JSON.parse(jsonDraft));
      setDraft(parsed);
      setJsonDraft(JSON.stringify(parsed, null, 2));
      setMessage("Raw JSON applied.");
      setError(null);
      return parsed;
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Invalid JSON");
      return null;
    }
  };

  const handleSave = async () => {
    if (!productId || !draft) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`http://localhost:5000/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stripDerivedFields(draft)),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update product");
      }

      const normalized = normalizeProduct(result.data);
      setProduct(normalized);
      setDraft(normalized);
      setJsonDraft(JSON.stringify(normalized, null, 2));
      setEditing(false);
      setMessage("Product updated successfully.");
      onUpdated?.();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to update product"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      showCloseButton={false}
      className="m-4 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[1280px]"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[28px] bg-white dark:bg-gray-900">
        <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800 lg:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40">
                {heroMedia ? (
                  <img src={heroMedia} alt={title} className="h-full w-full object-cover" />
                ) : (
                  <span className="px-3 text-center text-xs text-gray-400">No media</span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                    Product Workspace
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                    {loading && !record ? "Loading..." : title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {record?.businessName || "Business name not available"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {record?.lifecycleStatus && (
                    <Badge size="sm" color={badgeColor(record.lifecycleStatus)}>
                      {record.lifecycleStatus.replace("-", " ")}
                    </Badge>
                  )}
                  {record?.shopify?.shopifyStatus && (
                    <Badge
                      size="sm"
                      color={record.shopify.shopifyStatus === "active" ? "success" : "warning"}
                    >
                      Shopify {display(record.shopify.shopifyStatus)}
                    </Badge>
                  )}
                  {record?.ownership?.claimed === true && (
                    <Badge size="sm" color="info">
                      Claimed
                    </Badge>
                  )}
                  {record?.source && (
                    <Badge size="sm" color="light">
                      Source {display(record.source)}
                    </Badge>
                  )}
                </div>

                <div className="grid gap-2 text-sm text-gray-500 dark:text-gray-400 sm:grid-cols-3">
                  <Meta label="Product ID" value={record?.id ?? "-"} />
                  <Meta label="Created" value={formatTimestamp(record?.createdAt)} />
                  <Meta label="Updated" value={formatTimestamp(updatedAt)} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <div className="flex flex-wrap gap-2 xl:justify-end">
                {headerLinks.map((link) => (
                  <button
                    key={link.url}
                    type="button"
                    onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                    className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {link.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-2 text-sm text-gray-500 dark:text-gray-400 sm:grid-cols-3 xl:max-w-[460px]">
                <Meta label="Vendor" value={record?.vendorId ?? "-"} />
                <Meta label="Category" value={category} />
                <Meta label="Plan" value={selectedPlan} />
              </div>

              <div className="flex flex-wrap gap-3 xl:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Close
                </button>
                {editing ? (
                  <>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      disabled={saving}
                      className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || loading || !draft}
                      className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={beginEditing}
                    disabled={loading || !product}
                    className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          </div>

          {(message || error) && (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                error
                  ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300"
                  : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"
              }`}
            >
              {error || message}
            </div>
          )}
        </div>

        <div className="border-b border-gray-200 px-5 dark:border-gray-800 lg:px-7">
          <div className="custom-scrollbar flex gap-2 overflow-x-auto py-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/40"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5 lg:px-7 lg:py-6">
          {loading && (
            <Card title="Loading">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Fetching the full Firestore product record.
              </p>
            </Card>
          )}

          {!loading && !error && record && (
            <div className="space-y-6">
              {activeTab === "overview" && (
                <div className="grid gap-6 xl:grid-cols-[1.35fr,0.95fr]">
                  <Card title="Product Overview">
                    <div className="grid gap-5 md:grid-cols-2">
                      <EditableTextField
                        label="Product Name"
                        value={text(getResolvedValue(record, productNamePaths, productNamePaths[0]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(productNamePaths, productNamePaths[0], value)
                        }
                      />
                      <StaticField
                        label="Business Name"
                        value={record.businessName || "Business name not available"}
                      />
                      <StaticField
                        label="Vendor ID"
                        value={record.vendorId || "Not available"}
                      />
                      <SearchableSelectField
                        label="Category"
                        value={text(getResolvedValue(record, categoryPaths, categoryPaths[1]))}
                        editing={editing}
                        options={categories.map((item) => item.name)}
                        onChange={handleMainCategoryChange}
                      />
                      <SearchableSelectField
                        label="Sub Category"
                        value={text(getResolvedValue(record, subCategoryPaths, subCategoryPaths[0]))}
                        editing={editing}
                        options={(selectedMainCategory?.subcategories ?? []).map((item) => item.name)}
                        onChange={handleSubCategoryChange}
                        disabled={editing && !selectedMainCategory}
                      />
                      <SearchableMultiSelectField
                        label="Sub-Sub Category"
                        values={selectedSubSubCategoryNames}
                        editing={editing}
                        options={(selectedSubCategory?.subsubcategories ?? []).map((item) => item.name)}
                        onChange={handleSubSubCategoryChange}
                        disabled={editing && !selectedSubCategory}
                      />
                      <EditableTextField
                        label="Selected Plan"
                        value={text(getResolvedValue(record, selectedPlanPaths, selectedPlanPaths[1]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(selectedPlanPaths, selectedPlanPaths[1], value)
                        }
                      />
                      <EditableTextField
                        label="Primary Price"
                        value={text(getResolvedValue(record, pricePaths, pricePaths[1]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(pricePaths, pricePaths[1], value)
                        }
                      />
                      <div className="md:col-span-2">
                        <EditableTextareaField
                          label="Description"
                          value={text(getResolvedValue(record, descriptionPaths, descriptionPaths[0]))}
                          editing={editing}
                          rows={7}
                          onChange={(value) =>
                            setResolvedValue(descriptionPaths, descriptionPaths[0], value)
                          }
                        />
                      </div>
                    </div>
                  </Card>

                  <Card title="Snapshot">
                    <div className="space-y-4">
                      <EditableTextField
                        label="Product Type"
                        value={text(getResolvedValue(record, productTypePaths, productTypePaths[0]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(productTypePaths, productTypePaths[0], value)
                        }
                      />
                      <EditableTextField
                        label="Demo Link"
                        value={text(record?.vendor?.basic?.demoLink)}
                        editing={editing}
                        onChange={(value) => setValue("vendor.basic.demoLink", value)}
                      />
                      <EditableTextField
                        label="Affiliate URL"
                        value={text(getResolvedValue(record, affiliatePaths, affiliatePaths[1]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(affiliatePaths, affiliatePaths[1], value)
                        }
                      />
                      <EditableBooleanField
                        label="Published"
                        value={record?.shopify?.product?.published}
                        editing={editing}
                        onChange={(value) => setValue("shopify.product.published", value)}
                      />
                      <EditableTextField
                        label="Shopify Product URL"
                        value={text(getResolvedValue(record, shopifyUrlPaths, shopifyUrlPaths[1]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(shopifyUrlPaths, shopifyUrlPaths[1], value)
                        }
                      />
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === "catalog" && (
                <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
                  <Card title="Classification">
                    <div className="grid gap-5 md:grid-cols-2">
                      <EditableSelectField
                        label="Lifecycle Status"
                        value={text(record.lifecycleStatus)}
                        editing={editing}
                        options={["pending", "active", "rejected", "on-hold"]}
                        onChange={(value) => setValue("lifecycleStatus", value)}
                      />
                      <EditableSelectField
                        label="Source"
                        value={text(record.source)}
                        editing={editing}
                        options={["vendor", "shopify"]}
                        onChange={(value) => setValue("source", value)}
                      />
                      <SearchableSelectField
                        label="Category"
                        value={text(getResolvedValue(record, categoryPaths, categoryPaths[1]))}
                        editing={editing}
                        options={categories.map((item) => item.name)}
                        onChange={handleMainCategoryChange}
                      />
                      <SearchableSelectField
                        label="Sub Category"
                        value={text(getResolvedValue(record, subCategoryPaths, subCategoryPaths[0]))}
                        editing={editing}
                        options={(selectedMainCategory?.subcategories ?? []).map((item) => item.name)}
                        onChange={handleSubCategoryChange}
                        disabled={editing && !selectedMainCategory}
                      />
                      <EditableTextField
                        label="Product Type"
                        value={text(getResolvedValue(record, productTypePaths, productTypePaths[0]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(productTypePaths, productTypePaths[0], value)
                        }
                      />
                    </div>

                    <div className="mt-5 space-y-4">
                      <EditableTagsField
                        label="Keywords"
                        values={keywords}
                        editing={editing}
                        onChange={(value) => setValue("vendor.basic.keywords", value)}
                      />
                      <EditableTagsField
                        label="Shopify Tags"
                        values={tags}
                        editing={editing}
                        onChange={(value) => setValue("shopify.product.tags", value)}
                      />
                      <SearchableMultiSelectField
                        label="Sub-Sub Categories"
                        values={selectedSubSubCategoryNames}
                        editing={editing}
                        options={(selectedSubCategory?.subsubcategories ?? []).map((item) => item.name)}
                        onChange={handleSubSubCategoryChange}
                        disabled={editing && !selectedSubCategory}
                      />
                    </div>
                  </Card>

                  <Card title="Feature Data">
                    <div className="space-y-4">
                      <EditableJsonField
                        label="Features"
                        value={record?.vendor?.features ?? []}
                        editing={editing}
                        rows={10}
                        onApply={(value) => setValue("vendor.features", value)}
                      />
                      {!editing && features.length === 0 && (
                        <Empty text="No structured feature list is available." />
                      )}
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === "media" && (
                <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
                  <Card title="Media Gallery">
                    {media.length > 0 ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {media.map((item) => (
                          <div
                            key={`${item.label}-${item.url}`}
                            className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-800/40"
                          >
                            <div className="aspect-[16/10] overflow-hidden bg-gray-50 dark:bg-gray-800">
                              <img
                                src={item.url}
                                alt={item.label}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="space-y-2 p-4">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {item.label}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  window.open(item.url, "_blank", "noopener,noreferrer")
                                }
                                className="break-all text-left text-sm text-brand-600 hover:underline dark:text-brand-400"
                              >
                                {item.url}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty text="No media assets are stored for this product." />
                    )}

                    <div className="mt-5 grid gap-5">
                      <EditableJsonField
                        label="Vendor Media"
                        value={record?.vendor?.media ?? {}}
                        editing={editing}
                        rows={8}
                        onApply={(value) => setValue("vendor.media", value)}
                      />
                      <EditableJsonField
                        label="Top-Level Media"
                        value={record?.media ?? {}}
                        editing={editing}
                        rows={6}
                        onApply={(value) => setValue("media", value)}
                      />
                    </div>
                  </Card>

                  <Card title="External Links">
                    <div className="space-y-4">
                      <EditableTextField
                        label="Demo Link"
                        value={text(record?.vendor?.basic?.demoLink)}
                        editing={editing}
                        onChange={(value) => setValue("vendor.basic.demoLink", value)}
                      />
                      <EditableTextField
                        label="Affiliate URL"
                        value={text(getResolvedValue(record, affiliatePaths, affiliatePaths[1]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(affiliatePaths, affiliatePaths[1], value)
                        }
                      />
                      <EditableTextField
                        label="Shopify Product URL"
                        value={text(getResolvedValue(record, shopifyUrlPaths, shopifyUrlPaths[1]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(shopifyUrlPaths, shopifyUrlPaths[1], value)
                        }
                      />
                      <EditableTextField
                        label="Verification Domain"
                        value={text(record?.linkVerification?.domain)}
                        editing={editing}
                        onChange={(value) => setValue("linkVerification.domain", value)}
                      />
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === "pricing" && (
                <div className="grid gap-6 xl:grid-cols-[0.8fr,1.2fr]">
                  <Card title="Pricing Summary">
                    <div className="space-y-4">
                      <EditableTextField
                        label="Selected Plan"
                        value={text(getResolvedValue(record, selectedPlanPaths, selectedPlanPaths[1]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(selectedPlanPaths, selectedPlanPaths[1], value)
                        }
                      />
                      <EditableTextField
                        label="Primary Price"
                        value={text(getResolvedValue(record, pricePaths, pricePaths[1]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(pricePaths, pricePaths[1], value)
                        }
                      />
                      <EditableTextField
                        label="Affiliate URL"
                        value={text(getResolvedValue(record, affiliatePaths, affiliatePaths[1]))}
                        editing={editing}
                        onChange={(value) =>
                          setResolvedValue(affiliatePaths, affiliatePaths[1], value)
                        }
                      />
                    </div>
                  </Card>

                  <Card title="Plan Breakdown">
                    <div className="space-y-4">
                      {editing && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={addPlanRow}
                            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            Add Plan Row
                          </button>
                        </div>
                      )}

                      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/60">
                              <tr>
                                <Head>Plan</Head>
                                <Head>Intro Price</Head>
                                <Head>Intro Term</Head>
                                <Head>Renewal Price</Head>
                                <Head>Renewal Term</Head>
                                <Head>Type</Head>
                                {editing && <Head>Action</Head>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                              {plans.length > 0 ? (
                                plans.map((plan, index) => (
                                  <tr key={`${plan.name ?? "plan"}-${index}`}>
                                    <Cell>
                                      {editing ? (
                                        <InlineInput
                                          value={text(plan.name)}
                                          onChange={(value) => updatePlan(index, "name", value)}
                                        />
                                      ) : (
                                        display(plan.name)
                                      )}
                                    </Cell>
                                    <Cell>
                                      {editing ? (
                                        <InlineInput
                                          value={text(plan.introPrice)}
                                          onChange={(value) =>
                                            updatePlan(index, "introPrice", value)
                                          }
                                        />
                                      ) : (
                                        display(plan.introPrice)
                                      )}
                                    </Cell>
                                    <Cell>
                                      {editing ? (
                                        <InlineInput
                                          value={text(plan.introTerm)}
                                          onChange={(value) => updatePlan(index, "introTerm", value)}
                                        />
                                      ) : (
                                        display(plan.introTerm)
                                      )}
                                    </Cell>
                                    <Cell>
                                      {editing ? (
                                        <InlineInput
                                          value={text(plan.renewalPrice)}
                                          onChange={(value) =>
                                            updatePlan(index, "renewalPrice", value)
                                          }
                                        />
                                      ) : (
                                        display(plan.renewalPrice)
                                      )}
                                    </Cell>
                                    <Cell>
                                      {editing ? (
                                        <InlineInput
                                          value={text(plan.renewalTerm)}
                                          onChange={(value) =>
                                            updatePlan(index, "renewalTerm", value)
                                          }
                                        />
                                      ) : (
                                        display(plan.renewalTerm)
                                      )}
                                    </Cell>
                                    <Cell>
                                      {editing ? (
                                        <InlineInput
                                          value={text(plan.type)}
                                          onChange={(value) => updatePlan(index, "type", value)}
                                        />
                                      ) : (
                                        display(plan.type)
                                      )}
                                    </Cell>
                                    {editing && (
                                      <Cell>
                                        <button
                                          type="button"
                                          onClick={() => removePlanRow(index)}
                                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/20 dark:text-red-300 dark:hover:bg-red-500/10"
                                        >
                                          Remove
                                        </button>
                                      </Cell>
                                    )}
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td
                                    colSpan={editing ? 7 : 6}
                                    className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                                  >
                                    No plan rows available.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === "verification" && (
                <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
                  <Card title="Ownership & Verification">
                    <div className="grid gap-5 md:grid-cols-2">
                      <EditableBooleanField
                        label="Claimed"
                        value={record?.ownership?.claimed}
                        editing={editing}
                        onChange={(value) => setValue("ownership.claimed", value)}
                      />
                      <StaticField label="Claimed By" value={claimedByDisplay} />
                      <EditableTextField
                        label="Claimed By Vendor ID"
                        value={text(record?.ownership?.claimedByVendorId)}
                        editing={editing}
                        onChange={(value) => setValue("ownership.claimedByVendorId", value)}
                      />
                      <EditableTextField
                        label="Claimed At"
                        value={timestampInputValue(record?.ownership?.claimedAt)}
                        editing={editing}
                        onChange={(value) => setValue("ownership.claimedAt", value)}
                      />
                      <EditableBooleanField
                        label="Product Verified"
                        value={record?.vendor?.verification?.productVerified}
                        editing={editing}
                        onChange={(value) => setValue("vendor.verification.productVerified", value)}
                      />
                      <EditableBooleanField
                        label="Link Verified"
                        value={record?.vendor?.verification?.productLinkVerified}
                        editing={editing}
                        onChange={(value) =>
                          setValue("vendor.verification.productLinkVerified", value)
                        }
                      />
                      <EditableBooleanField
                        label="Support Verified"
                        value={record?.vendor?.verification?.supportResponseVerified}
                        editing={editing}
                        onChange={(value) =>
                          setValue("vendor.verification.supportResponseVerified", value)
                        }
                      />
                      <EditableBooleanField
                        label="Refund Clarity"
                        value={record?.vendor?.verification?.refundClarityVerified}
                        editing={editing}
                        onChange={(value) =>
                          setValue("vendor.verification.refundClarityVerified", value)
                        }
                      />
                      <EditableBooleanField
                        label="Sponsored"
                        value={record?.vendor?.verification?.isSponsored}
                        editing={editing}
                        onChange={(value) => setValue("vendor.verification.isSponsored", value)}
                      />
                    </div>
                  </Card>

                  <Card title="Link Verification">
                    <div className="grid gap-5 md:grid-cols-2">
                      <EditableTextField
                        label="Status"
                        value={text(record?.linkVerification?.status)}
                        editing={editing}
                        onChange={(value) => setValue("linkVerification.status", value)}
                      />
                      <EditableTextField
                        label="Domain"
                        value={text(record?.linkVerification?.domain)}
                        editing={editing}
                        onChange={(value) => setValue("linkVerification.domain", value)}
                      />
                      <EditableTextField
                        label="Method"
                        value={text(record?.linkVerification?.method)}
                        editing={editing}
                        onChange={(value) => setValue("linkVerification.method", value)}
                      />
                      <EditableTextField
                        label="Token"
                        value={text(record?.linkVerification?.token)}
                        editing={editing}
                        onChange={(value) => setValue("linkVerification.token", value)}
                      />
                      <EditableTextField
                        label="Verified At"
                        value={timestampInputValue(record?.linkVerification?.verifiedAt)}
                        editing={editing}
                        onChange={(value) => setValue("linkVerification.verifiedAt", value)}
                      />
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-3">
                      <EditableJsonField
                        label="DNS"
                        value={record?.linkVerification?.dns ?? {}}
                        editing={editing}
                        rows={8}
                        onApply={(value) => setValue("linkVerification.dns", value)}
                      />
                      <EditableJsonField
                        label="Meta"
                        value={record?.linkVerification?.meta ?? {}}
                        editing={editing}
                        rows={8}
                        onApply={(value) => setValue("linkVerification.meta", value)}
                      />
                      <EditableJsonField
                        label="HTML"
                        value={record?.linkVerification?.html ?? {}}
                        editing={editing}
                        rows={8}
                        onApply={(value) => setValue("linkVerification.html", value)}
                      />
                    </div>
                  </Card>
                </div>
              )}

              {activeTab === "shopify" && (
                <div className="space-y-6">
                  <div className="grid gap-6 xl:grid-cols-3">
                    <Card title="Identifiers">
                      <div className="space-y-4">
                        <EditableTextField
                          label="Handle"
                          value={text(getResolvedValue(record, handlePaths, handlePaths[0]))}
                          editing={editing}
                          onChange={(value) =>
                            setResolvedValue(handlePaths, handlePaths[0], value)
                          }
                        />
                        <EditableTextField
                          label="Product ID"
                          value={text(getResolvedValue(record, shopifyProductIdPaths, shopifyProductIdPaths[0]))}
                          editing={editing}
                          onChange={(value) =>
                            setResolvedValue(shopifyProductIdPaths, shopifyProductIdPaths[0], value)
                          }
                        />
                        <EditableTextField
                          label="GraphQL ID"
                          value={text(getResolvedValue(record, graphQlIdPaths, graphQlIdPaths[0]))}
                          editing={editing}
                          onChange={(value) =>
                            setResolvedValue(graphQlIdPaths, graphQlIdPaths[0], value)
                          }
                        />
                        <EditableTextField
                          label="Vendor"
                          value={text(record?.shopify?.product?.vendor)}
                          editing={editing}
                          onChange={(value) => setValue("shopify.product.vendor", value)}
                        />
                      </div>
                    </Card>

                    <Card title="Sync Status">
                      <div className="space-y-4">
                        <EditableSelectField
                          label="Shopify Status"
                          value={text(record?.shopify?.shopifyStatus)}
                          editing={editing}
                          options={["active", "draft", "archived"]}
                          onChange={(value) => setValue("shopify.shopifyStatus", value)}
                        />
                        <EditableTextField
                          label="Sync Action"
                          value={text(record?.shopify?.syncAction)}
                          editing={editing}
                          onChange={(value) => setValue("shopify.syncAction", value)}
                        />
                        <EditableTextField
                          label="Synced At"
                          value={timestampInputValue(record?.shopify?.syncedAt)}
                          editing={editing}
                          onChange={(value) => setValue("shopify.syncedAt", value)}
                        />
                        <EditableTextField
                          label="Last Error"
                          value={text(record?.shopify?.lastError)}
                          editing={editing}
                          onChange={(value) => setValue("shopify.lastError", value)}
                        />
                      </div>
                    </Card>

                    <Card title="Product Snapshot">
                      <div className="space-y-4">
                        <EditableTextField
                          label="Title"
                          value={text(getResolvedValue(record, productNamePaths, productNamePaths[0]))}
                          editing={editing}
                          onChange={(value) =>
                            setResolvedValue(productNamePaths, productNamePaths[0], value)
                          }
                        />
                        <EditableTextField
                          label="Category"
                          value={text(getResolvedValue(record, categoryPaths, categoryPaths[1]))}
                          editing={editing}
                          onChange={(value) =>
                            setResolvedValue(categoryPaths, categoryPaths[1], value)
                          }
                        />
                        <EditableTextField
                          label="Product Type"
                          value={text(getResolvedValue(record, productTypePaths, productTypePaths[0]))}
                          editing={editing}
                          onChange={(value) =>
                            setResolvedValue(productTypePaths, productTypePaths[0], value)
                          }
                        />
                        <EditableBooleanField
                          label="Published"
                          value={record?.shopify?.product?.published}
                          editing={editing}
                          onChange={(value) => setValue("shopify.product.published", value)}
                        />
                      </div>
                    </Card>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-3">
                    <EditableJsonField
                      label="SEO"
                      value={record?.shopify?.shopifyData?.seo ?? {}}
                      editing={editing}
                      rows={12}
                      onApply={(value) => setValue("shopify.shopifyData.seo", value)}
                    />
                    <EditableJsonField
                      label="Variants"
                      value={record?.shopify?.shopifyData?.variants ?? []}
                      editing={editing}
                      rows={12}
                      onApply={(value) => setValue("shopify.shopifyData.variants", value)}
                    />
                    <EditableJsonField
                      label="Metafields"
                      value={record?.shopify?.shopifyData?.metafields ?? {}}
                      editing={editing}
                      rows={12}
                      onApply={(value) => setValue("shopify.shopifyData.metafields", value)}
                    />
                  </div>

                  <Card title="Raw Firestore Payload">
                    {editing ? (
                      <div className="space-y-4">
                        <Field label="Raw JSON">
                          <textarea
                            rows={18}
                            value={jsonDraft}
                            onChange={(event) => setJsonDraft(event.target.value)}
                            className={`${inputClass} resize-y font-mono text-xs`}
                          />
                        </Field>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Use this editor when a field is not covered above. Apply the JSON
                          before saving.
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setJsonDraft(JSON.stringify(stripDerivedFields(draft), null, 2))
                            }
                            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            Reset JSON
                          </button>
                          <button
                            type="button"
                            onClick={applyRawJson}
                            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                          >
                            Apply JSON
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre className="overflow-x-auto rounded-2xl border border-gray-200 bg-gray-950 p-4 text-xs leading-6 text-gray-100 dark:border-gray-800">
                        {JSON.stringify(stripDerivedFields(record), null, 2)}
                      </pre>
                    )}
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

const Card = ({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    className={`rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900/60 ${className}`}
  >
    <h4 className="mb-5 text-base font-semibold text-gray-900 dark:text-white">{title}</h4>
    {children}
  </section>
);

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
      {label}
    </span>
    {children}
  </label>
);

const Input = ({
  value,
  onChange,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) => (
  <input
    type={type}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    className={inputClass}
  />
);

const TextArea = ({
  value,
  onChange,
  rows,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  rows: number;
  className?: string;
}) => (
  <textarea
    rows={rows}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    className={`${inputClass} resize-y ${className}`}
  />
);

const Select = ({
  value,
  onChange,
  options,
  allowEmpty = true,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  allowEmpty?: boolean;
  disabled?: boolean;
}) => (
  <select
    value={value}
    onChange={(event) => onChange(event.target.value)}
    disabled={disabled}
    className={`${inputClass} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
  >
    {allowEmpty && <option value="">Select an option</option>}
    {options.map((option) => (
      <option key={option} value={option}>
        {labelize(option)}
      </option>
    ))}
  </select>
);

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-800/40">
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
      {label}
    </p>
    <p className="mt-1 break-words text-sm text-gray-700 dark:text-gray-200">{value}</p>
  </div>
);

const DisplayCard = ({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) => (
  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/50">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
    <p className="mt-1 break-words text-sm leading-6 text-gray-700 dark:text-gray-200">
      {display(value)}
    </p>
  </div>
);

const StaticField = ({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) => <DisplayCard label={label} value={value} />;

const EditableTextField = ({
  label,
  value,
  editing,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  type?: string;
}) =>
  editing ? (
    <Field label={label}>
      <Input value={value} onChange={onChange} type={type} />
    </Field>
  ) : (
    <DisplayCard label={label} value={value} />
  );

const EditableTextareaField = ({
  label,
  value,
  editing,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  rows: number;
}) =>
  editing ? (
    <Field label={label}>
      <TextArea value={value} onChange={onChange} rows={rows} />
    </Field>
  ) : (
    <DisplayCard label={label} value={value} />
  );

const EditableSelectField = ({
  label,
  value,
  editing,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  editing: boolean;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) =>
  editing ? (
    <Field label={label}>
      <Select value={value} onChange={onChange} options={options} disabled={disabled} />
    </Field>
  ) : (
    <DisplayCard label={label} value={value} />
  );

const EditableBooleanField = ({
  label,
  value,
  editing,
  onChange,
}: {
  label: string;
  value: unknown;
  editing: boolean;
  onChange: (value: boolean | undefined) => void;
}) =>
  editing ? (
    <Field label={label}>
      <select
        value={booleanToSelect(value)}
        onChange={(event) => onChange(selectToBoolean(event.target.value))}
        className={inputClass}
      >
        <option value="">Not set</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </Field>
  ) : (
    <DisplayCard label={label} value={yesNo(value)} />
  );

const EditableTagsField = ({
  label,
  values,
  editing,
  onChange,
}: {
  label: string;
  values: string[];
  editing: boolean;
  onChange: (value: string[]) => void;
}) =>
  editing ? (
    <Field label={label}>
      <TextArea
        value={values.join(", ")}
        onChange={(value) => onChange(splitTags(value))}
        rows={4}
      />
    </Field>
  ) : values.length > 0 ? (
    <TagBlock title={label} tags={values} />
  ) : (
    <Empty text={`No ${label.toLowerCase()} available.`} />
  );

const EditableJsonField = ({
  label,
  value,
  editing,
  onApply,
  rows = 8,
}: {
  label: string;
  value: unknown;
  editing: boolean;
  onApply: (value: unknown) => void;
  rows?: number;
}) =>
  editing ? (
    <JsonEditorField label={label} value={value} rows={rows} onApply={onApply} />
  ) : (
    <JsonCard title={label} value={value} />
  );

const Head = ({ children }: { children: React.ReactNode }) => (
  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
    {children}
  </th>
);

const Cell = ({ children }: { children: React.ReactNode }) => (
  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{children}</td>
);

const InlineInput = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) => (
  <input
    value={value}
    onChange={(event) => onChange(event.target.value)}
    className="w-full min-w-[110px] rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
  />
);

const SearchableSelectField = ({
  label,
  value,
  editing,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  editing: boolean;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) => {
  const listId = `${slugify(label)}-options`;

  return editing ? (
    <Field label={label}>
      <input
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={disabled ? "Select previous category first" : "Search or type"}
        className={`${inputClass} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </Field>
  ) : (
    <DisplayCard label={label} value={value} />
  );
};

const SearchableMultiSelectField = ({
  label,
  values,
  editing,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  values: string[];
  editing: boolean;
  options: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) => {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!editing) {
      setQuery("");
    }
  }, [editing]);

  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(query.toLowerCase())
  );

  const toggleValue = (option: string) => {
    const exists = values.some((value) => sameName(value, option));
    onChange(
      exists
        ? values.filter((value) => !sameName(value, option))
        : [...values, option]
    );
  };

  return editing ? (
    <Field label={label}>
      <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={disabled}
          placeholder={disabled ? "Select sub category first" : "Search options"}
          className={`${inputClass} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        />
        <div className="flex flex-wrap gap-2">
          {values.length > 0 ? (
            values.map((value) => (
              <span
                key={value}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-200"
              >
                {value}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">No selection</span>
          )}
        </div>
        <div className="max-h-52 space-y-2 overflow-y-auto">
          {(filteredOptions.length > 0 ? filteredOptions : options).map((option) => {
            const checked = values.some((value) => sameName(value, option));
            return (
              <label
                key={option}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                  checked
                    ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
                    : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleValue(option)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
                <span>{option}</span>
              </label>
            );
          })}
          {options.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No options available.</p>
          )}
        </div>
      </div>
    </Field>
  ) : values.length > 0 ? (
    <TagBlock title={label} tags={values} />
  ) : (
    <Empty text={`No ${label.toLowerCase()} available.`} />
  );
};

const JsonEditorField = ({
  label,
  value,
  rows,
  onApply,
}: {
  label: string;
  value: unknown;
  rows: number;
  onApply: (value: unknown) => void;
}) => {
  const serializedValue = JSON.stringify(value ?? null, null, 2);
  const [textValue, setTextValue] = useState(serializedValue);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setTextValue(serializedValue);
    setParseError(null);
  }, [serializedValue]);

  const applyValue = () => {
    try {
      const parsed = JSON.parse(textValue);
      onApply(parsed);
      setTextValue(JSON.stringify(parsed, null, 2));
      setParseError(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Invalid JSON");
    }
  };

  return (
    <Field label={label}>
      <div className="space-y-3">
        <TextArea
          value={textValue}
          onChange={setTextValue}
          rows={rows}
          className="font-mono text-xs"
        />
        {parseError && (
          <p className="text-xs text-error-600 dark:text-error-300">{parseError}</p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setTextValue(serializedValue);
              setParseError(null);
            }}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={applyValue}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Apply JSON
          </button>
        </div>
      </div>
    </Field>
  );
};

const TagBlock = ({ title, tags }: { title: string; tags: string[] }) => (
  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          {tag}
        </span>
      ))}
    </div>
  </div>
);

const JsonCard = ({ title, value }: { title: string; value: unknown }) => (
  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
    <pre className="mt-3 overflow-x-auto rounded-xl bg-gray-950 p-3 text-xs leading-6 text-gray-100">
      {JSON.stringify(value ?? "Not available", null, 2)}
    </pre>
  </div>
);

const Empty = ({ text }: { text: string }) => (
  <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>
);

const normalizeProduct = (value: unknown): ProductDetails => {
  const base = deepClone(isRecord(value) ? value : {});
  delete (base as Record<string, unknown>).vendorResolved;

  return {
    ...(base as Record<string, unknown>),
    id: text((base as Record<string, unknown>).id),
    ownership: isRecord((base as Record<string, unknown>).ownership)
      ? ((base as Record<string, unknown>).ownership as Record<string, unknown>)
      : {},
    linkVerification: isRecord((base as Record<string, unknown>).linkVerification)
      ? ((base as Record<string, unknown>).linkVerification as Record<string, unknown>)
      : {},
    vendor: isRecord((base as Record<string, unknown>).vendor)
      ? ((base as Record<string, unknown>).vendor as Record<string, unknown>)
      : {},
    shopify: isRecord((base as Record<string, unknown>).shopify)
      ? ((base as Record<string, unknown>).shopify as Record<string, unknown>)
      : {},
    media: isRecord((base as Record<string, unknown>).media)
      ? ((base as Record<string, unknown>).media as Record<string, unknown>)
      : {},
  } as ProductDetails;
};

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const stripDerivedFields = (value: ProductDetails | null) => {
  if (!value) return {};
  const clone = deepClone(value);
  delete (clone as Record<string, unknown>).vendorResolved;
  delete (clone as Record<string, unknown>).businessName;
  delete (clone as Record<string, unknown>).claimedByBusinessName;
  return clone;
};

const setPath = <T,>(value: T, path: string[], nextValue: unknown): T => {
  if (path.length === 0) return nextValue as T;

  const [head, ...tail] = path;
  const key: string | number = /^\d+$/.test(head) ? Number(head) : head;

  if (Array.isArray(value)) {
    const nextArray = [...value];
    const index = typeof key === "number" ? key : Number(key);
    const current = nextArray[index];
    nextArray[index] = tail.length
      ? setPath(current ?? {}, tail, nextValue)
      : nextValue;
    return nextArray as T;
  }

  const record = isRecord(value) ? (value as Record<string, unknown>) : {};
  const current = record[String(key)];

  return {
    ...record,
    [key]: tail.length
      ? setPath(
          Array.isArray(current) || isRecord(current) ? current : /^\d+$/.test(tail[0] ?? "") ? [] : {},
          tail,
          nextValue
        )
      : nextValue,
  } as T;
};

const getNested = (value: unknown, path: string) =>
  path.split(".").reduce<unknown>((accumulator, part) => {
    if (accumulator === null || accumulator === undefined) return undefined;
    if (Array.isArray(accumulator)) {
      const index = Number(part);
      return Number.isNaN(index) ? undefined : accumulator[index];
    }
    return isRecord(accumulator) ? accumulator[part] : undefined;
  }, value);

const resolvePath = (
  value: unknown,
  candidates: string[],
  fallback: string
) => candidates.find((path) => getNested(value, path) !== undefined) ?? fallback;

const getResolvedValue = (
  value: unknown,
  candidates: string[],
  fallback: string
) => getNested(value, resolvePath(value, candidates, fallback));

const collectLinks = (product: ProductDetails | null): LinkItem[] => {
  if (!product) return [];

  const domain =
    typeof product?.linkVerification?.domain === "string" &&
    product.linkVerification.domain.trim()
      ? withProtocol(product.linkVerification.domain)
      : null;

  const items = [
    { label: "Demo Link", url: product?.vendor?.basic?.demoLink },
    {
      label: "Affiliate URL",
      url:
        product?.vendor?.productPlanPricing?.affiliateUrl ??
        product?.vendor?.pricing?.affiliateUrl,
    },
    {
      label: "Shopify Product",
      url:
        product?.shopify?.identifiers?.shopifyProductURL ??
        product?.shopifyProductURL ??
        product?.shopify?.shopifyProductURL,
    },
    { label: "Domain", url: domain },
  ].filter((item): item is LinkItem => isUrl(item.url));

  return Array.from(new Map(items.map((item) => [item.url, item])).values());
};

const collectMedia = (product: ProductDetails | null): MediaItem[] => {
  if (!product) return [];

  const found = new Map<string, MediaItem>();
  const pattern = /(image|thumbnail|logo|banner|icon|screenshot|media|gallery|photo)/i;

  const walk = (value: unknown, path = "") => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    if (isRecord(value)) {
      Object.entries(value).forEach(([key, nested]) =>
        walk(nested, path ? `${path}.${key}` : key)
      );
      return;
    }

    if (isUrl(value) && pattern.test(path)) {
      found.set(value, {
        label: pathToLabel(path),
        url: value,
      });
    }
  };

  walk(product.vendor?.media, "vendor.media");
  walk(product.shopify?.product, "shopify.product");
  walk(product.shopify?.shopifyData, "shopify.shopifyData");
  walk(product.media, "media");

  return Array.from(found.values());
};

const normalizeTextArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];

const normalizeFeatures = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { name: item, description: "" };
      if (item && typeof item === "object") {
        return {
          name: String((item as Record<string, unknown>).name ?? "Feature"),
          description: String((item as Record<string, unknown>).description ?? ""),
        };
      }
      return null;
    })
    .filter(Boolean) as Array<{ name: string; description: string }>;
};

const normalizePlans = (value: unknown): PlanRow[] =>
  Array.isArray(value)
    ? value.map((plan) =>
        isRecord(plan)
          ? {
              ...plan,
              name: text(plan.name),
              introPrice: text(plan.introPrice),
              introTerm: text(plan.introTerm),
              renewalPrice: text(plan.renewalPrice),
              renewalTerm: text(plan.renewalTerm),
              type: text(plan.type),
            }
          : {
              name: text(plan),
              introPrice: "",
              introTerm: "",
              renewalPrice: "",
              renewalTerm: "",
              type: "",
            }
      )
    : [];

const normalizeSubSubCategoryNames = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) =>
          isRecord(item) ? text(item.name) : typeof item === "string" ? item : ""
        )
        .filter(Boolean)
    : [];

const sameName = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

const findMainCategory = (categories: MainCategory[], value: string) =>
  categories.find((category) => sameName(category.name, value)) ?? null;

const findSubCategory = (category: MainCategory | null, value: string) =>
  category?.subcategories?.find((subCategory) => sameName(subCategory.name, value)) ?? null;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");

const splitTags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const display = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const formatTimestamp = (value: TimestampLike) => {
  if (!value) return "Not available";
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-IN");
  }
  if (
    typeof value === "object" &&
    value !== null &&
    typeof value._seconds === "number"
  ) {
    const date = new Date(
      value._seconds * 1000 + Math.round((value._nanoseconds ?? 0) / 1000000)
    );
    return date.toLocaleString("en-IN");
  }
  return "Not available";
};

const timestampInputValue = (value: TimestampLike) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
  }
  if (
    typeof value === "object" &&
    value !== null &&
    typeof value._seconds === "number"
  ) {
    return new Date(
      value._seconds * 1000 + Math.round((value._nanoseconds ?? 0) / 1000000)
    ).toISOString();
  }
  return "";
};

const booleanToSelect = (value: unknown) =>
  value === true ? "true" : value === false ? "false" : "";

const selectToBoolean = (value: string) =>
  value === "true" ? true : value === "false" ? false : undefined;

const yesNo = (value: unknown) =>
  typeof value === "boolean" ? (value ? "Yes" : "No") : "Not available";

const text = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);

const isUrl = (value: unknown): value is string =>
  typeof value === "string" && /^https?:\/\//i.test(value);

const withProtocol = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

const badgeColor = (status: string) => {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  if (status === "on-hold") return "info";
  return "error";
};

const pathToLabel = (value: string) => {
  const parts = value
    .split(/[.[\]]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => Number.isNaN(Number(part)));

  const relevant = parts.slice(-2).map(labelize);
  return relevant.join(" / ") || "Media";
};

const labelize = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (match) => match.toUpperCase());

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export default ProductDetailsModal;

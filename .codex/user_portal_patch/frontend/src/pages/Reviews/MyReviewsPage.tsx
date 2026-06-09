import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  ChartNoAxesColumn,
  Flag,
  MessageSquare,
  PencilLine,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { EmptyState } from "../../components/common/EmptyState";
import { FormField } from "../../components/common/FormField";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusBadge } from "../../components/common/StatusBadge";
import { useToast } from "../../hooks/useToast";
import {
  addReviewThreadMessage,
  createReview,
  deleteReview,
  fetchMyReviews,
  fetchReviewCatalog,
  fetchReviewCollectionProducts,
  fetchReviewTaxonomy,
  reportReview,
  type ReviewCatalog,
  type ReviewCategoryKey,
  type ReviewCollectionProduct,
  type ReviewPayload,
  type ReviewRecord,
  type ReviewTaxonomyRow,
  updateReview,
} from "../../services/reviews.service";

type ReviewFormState = {
  selectedTopCategory: string;
  selectedSubcategory: string;
  selectedCollectionHandle: string;
  productId: string;
  shopifyProductId: string;
  productHandle: string;
  productUrl: string;
  productLogoUrl: string;
  officialUrl: string;
  productName: string;
  vendorName: string;
  categoryKey: ReviewCategoryKey;
  ratings: Record<string, number>;
  reviewTitle: string;
  reviewBody: string;
  recommend: boolean;
  visibility: "public" | "anonymous_display_name";
};

const FALLBACK_CATALOG: ReviewCatalog = {
  categories: [
    {
      key: "software_saas",
      label: "Software / SaaS",
      dimensions: [
        { key: "overall_rating", label: "Overall Rating" },
        { key: "ease_of_use", label: "Ease of Use" },
        { key: "features", label: "Features" },
        { key: "integrations", label: "Integrations" },
        { key: "customization", label: "Customization" },
        { key: "performance", label: "Performance" },
        { key: "support", label: "Support" },
        { key: "value_for_money", label: "Value for Money" },
      ],
    },
    {
      key: "cloud_services",
      label: "Cloud Services",
      dimensions: [
        { key: "overall_rating", label: "Overall Rating" },
        { key: "uptime", label: "Uptime" },
        { key: "speed", label: "Speed" },
        { key: "support", label: "Support" },
        { key: "ease_of_setup", label: "Ease of Setup" },
        { key: "security", label: "Security" },
        { key: "scalability", label: "Scalability" },
        { key: "value_for_money", label: "Value for Money" },
      ],
    },
    {
      key: "ai_tools",
      label: "AI Tools",
      dimensions: [
        { key: "overall_rating", label: "Overall Rating" },
        { key: "output_quality", label: "Output Quality" },
        { key: "accuracy", label: "Accuracy" },
        { key: "ease_of_use", label: "Ease of Use" },
        { key: "speed", label: "Speed" },
        { key: "customization", label: "Customization" },
        { key: "pricing_fairness", label: "Pricing Fairness" },
        { key: "value_for_money", label: "Value for Money" },
      ],
    },
    {
      key: "common",
      label: "Common",
      dimensions: [
        { key: "overall_rating", label: "Overall Rating" },
        { key: "ease_of_use", label: "Ease of Use" },
        { key: "features", label: "Features" },
        { key: "performance", label: "Performance" },
        { key: "support", label: "Support" },
        { key: "value_for_money", label: "Value for Money" },
      ],
    },
  ],
};

function buildRatingsFromCategory(catalog: ReviewCatalog, categoryKey: ReviewCategoryKey, source?: Record<string, number>) {
  const category = catalog.categories.find((item) => item.key === categoryKey) ?? catalog.categories[0];
  return Object.fromEntries(category.dimensions.map((dimension) => [dimension.key, Number(source?.[dimension.key] ?? 5)]));
}

function buildDefaultForm(catalog: ReviewCatalog, categoryKey: ReviewCategoryKey = "software_saas"): ReviewFormState {
  return {
    selectedTopCategory: "",
    selectedSubcategory: "",
    selectedCollectionHandle: "",
    productId: "",
    shopifyProductId: "",
    productHandle: "",
    productUrl: "",
    productLogoUrl: "",
    officialUrl: "",
    productName: "",
    vendorName: "",
    categoryKey,
    ratings: buildRatingsFromCategory(catalog, categoryKey),
    reviewTitle: "",
    reviewBody: "",
    recommend: true,
    visibility: "public",
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

function mapTopCategoryToReviewCategory(value: string): ReviewCategoryKey {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("ai")) return "ai_tools";
  if (normalized.includes("hosting") || normalized.includes("cloud")) return "cloud_services";
  if (normalized.includes("software")) return "software_saas";
  return "common";
}

function uniqueBy<T>(items: T[], keySelector: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keySelector(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function findProductByHandle(products: ReviewCollectionProduct[], productHandle: string) {
  return products.find((item) => item.productHandle === productHandle) ?? null;
}

function ReadonlyField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <label className={["block space-y-2.5", className].join(" ")}>
      <span className="text-sm font-semibold text-white">{label}</span>
      <input value={value} disabled className="portal-input bg-white/10 text-slate-100 disabled:cursor-not-allowed disabled:opacity-100" />
    </label>
  );
}

export function MyReviewsPage() {
  const { pushToast } = useToast();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [catalog, setCatalog] = useState<ReviewCatalog>(FALLBACK_CATALOG);
  const [taxonomy, setTaxonomy] = useState<ReviewTaxonomyRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[] | null>(null);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
  const [reviewPendingDelete, setReviewPendingDelete] = useState<ReviewRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [threadMessage, setThreadMessage] = useState("");
  const [form, setForm] = useState<ReviewFormState>(() => buildDefaultForm(FALLBACK_CATALOG));
  const [loadError, setLoadError] = useState(false);
  const [collectionProducts, setCollectionProducts] = useState<ReviewCollectionProduct[]>([]);
  const [collectionProductsLoading, setCollectionProductsLoading] = useState(false);

  const category = useMemo(
    () => catalog.categories.find((item) => item.key === form.categoryKey) ?? catalog.categories[0],
    [catalog, form.categoryKey]
  );

  const activeReview = useMemo(
    () => reviews?.find((item) => item.id === activeReviewId) ?? null,
    [reviews, activeReviewId]
  );

  const topCategoryOptions = useMemo(
    () => uniqueBy(taxonomy, (item) => item.topSlug).map((item) => ({ value: item.topSlug, label: item.topCategory })),
    [taxonomy]
  );

  const subcategoryOptions = useMemo(
    () =>
      uniqueBy(
        taxonomy.filter((item) => item.topSlug === form.selectedTopCategory),
        (item) => item.subcategorySlug
      ).map((item) => ({ value: item.subcategorySlug, label: item.subcategory })),
    [form.selectedTopCategory, taxonomy]
  );

  const collectionOptions = useMemo(
    () =>
      uniqueBy(
        taxonomy.filter(
          (item) => item.topSlug === form.selectedTopCategory && item.subcategorySlug === form.selectedSubcategory
        ),
        (item) => item.collectionHandle
      ).map((item) => ({ value: item.collectionHandle, label: item.collectionTitle })),
    [form.selectedSubcategory, form.selectedTopCategory, taxonomy]
  );

  const selectedProduct = useMemo(
    () => findProductByHandle(collectionProducts, form.productHandle),
    [collectionProducts, form.productHandle]
  );

  async function loadReviews() {
    try {
      setLoadError(false);
      const [catalogData, reviewData, taxonomyData] = await Promise.all([
        fetchReviewCatalog().catch(() => FALLBACK_CATALOG),
        fetchMyReviews(),
        fetchReviewTaxonomy().catch(() => []),
      ]);
      setCatalog(catalogData);
      setReviews(reviewData);
      setTaxonomy(taxonomyData);
      if (reviewData.length > 0 && !activeReviewId) {
        setActiveReviewId(reviewData[0].id);
      }
    } catch {
      setLoadError(true);
      setReviews([]);
      setActiveReviewId(null);
      pushToast("Reviews could not be loaded right now.", "error");
    }
  }

  useEffect(() => {
    void loadReviews();
  }, []);

  async function loadProductsForCollection(collectionHandle: string) {
    if (!collectionHandle) {
      setCollectionProducts([]);
      return;
    }

    setCollectionProductsLoading(true);
    try {
      setCollectionProducts(await fetchReviewCollectionProducts(collectionHandle));
    } catch {
      setCollectionProducts([]);
      pushToast("Collection products could not be loaded right now.", "error");
    } finally {
      setCollectionProductsLoading(false);
    }
  }

  function scrollToComposer() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm(categoryKey: ReviewCategoryKey = "software_saas") {
    setForm(buildDefaultForm(catalog, categoryKey));
    setCollectionProducts([]);
    setActiveReviewId(null);
    setThreadMessage("");
  }

  function startNewReview() {
    resetForm("software_saas");
    scrollToComposer();
  }

  async function startEdit(review: ReviewRecord) {
    const metadata = review.metadata ?? {};
    const selectedCollectionHandle = String(metadata.selectedCollectionHandle ?? "");

    setActiveReviewId(review.id);
    setForm({
      selectedTopCategory: String(metadata.selectedTopCategory ?? ""),
      selectedSubcategory: String(metadata.selectedSubcategory ?? ""),
      selectedCollectionHandle,
      productId: review.productId ?? "",
      shopifyProductId: review.shopifyProductId ?? "",
      productHandle: review.productHandle ?? "",
      productUrl: review.productUrl ?? "",
      productLogoUrl: review.productLogoUrl ?? "",
      officialUrl: review.officialUrl ?? "",
      productName: review.productName,
      vendorName: review.vendorName,
      categoryKey: review.categoryKey,
      ratings: buildRatingsFromCategory(catalog, review.categoryKey, review.ratings),
      reviewTitle: review.reviewTitle,
      reviewBody: review.reviewBody,
      recommend: review.recommend,
      visibility: review.visibility,
    });

    if (selectedCollectionHandle) {
      await loadProductsForCollection(selectedCollectionHandle);
    } else {
      setCollectionProducts([]);
    }

    scrollToComposer();
  }

  function handleTopCategoryChange(nextTopCategory: string) {
    const nextCategoryKey = mapTopCategoryToReviewCategory(
      topCategoryOptions.find((item) => item.value === nextTopCategory)?.label ?? ""
    );

    setForm((current) => ({
      ...current,
      selectedTopCategory: nextTopCategory,
      selectedSubcategory: "",
      selectedCollectionHandle: "",
      productId: "",
      shopifyProductId: "",
      productHandle: "",
      productUrl: "",
      productLogoUrl: "",
      officialUrl: "",
      productName: "",
      vendorName: "",
      categoryKey: nextCategoryKey,
      ratings: buildRatingsFromCategory(catalog, nextCategoryKey),
    }));
    setCollectionProducts([]);
  }

  function handleSubcategoryChange(nextSubcategory: string) {
    setForm((current) => ({
      ...current,
      selectedSubcategory: nextSubcategory,
      selectedCollectionHandle: "",
      productId: "",
      shopifyProductId: "",
      productHandle: "",
      productUrl: "",
      productLogoUrl: "",
      officialUrl: "",
      productName: "",
      vendorName: "",
    }));
    setCollectionProducts([]);
  }

  async function handleCollectionChange(nextCollectionHandle: string) {
    const selectedRow = taxonomy.find((item) => item.collectionHandle === nextCollectionHandle);
    const nextCategoryKey = mapTopCategoryToReviewCategory(selectedRow?.topCategory ?? "");

    setForm((current) => ({
      ...current,
      selectedCollectionHandle: nextCollectionHandle,
      productId: "",
      shopifyProductId: "",
      productHandle: "",
      productUrl: "",
      productLogoUrl: "",
      officialUrl: "",
      productName: "",
      vendorName: "",
      categoryKey: nextCategoryKey,
      ratings: buildRatingsFromCategory(catalog, nextCategoryKey),
    }));
    await loadProductsForCollection(nextCollectionHandle);
  }

  function handleProductChange(nextProductHandle: string) {
    const product = findProductByHandle(collectionProducts, nextProductHandle);
    if (!product) {
      setForm((current) => ({
        ...current,
        productId: "",
        shopifyProductId: "",
        productHandle: "",
        productUrl: "",
        productLogoUrl: "",
        officialUrl: "",
        productName: "",
        vendorName: "",
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      productId: product.shopifyProductId,
      shopifyProductId: product.shopifyProductId,
      productHandle: product.productHandle,
      productUrl: product.productUrl,
      productLogoUrl: product.productLogoUrl,
      officialUrl: "",
      productName: product.productName,
      vendorName: product.vendorName,
    }));
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const selectedTopCategoryLabel = topCategoryOptions.find((item) => item.value === form.selectedTopCategory)?.label ?? "";
      const selectedSubcategoryLabel = subcategoryOptions.find((item) => item.value === form.selectedSubcategory)?.label ?? "";
      const selectedCollectionLabel = collectionOptions.find((item) => item.value === form.selectedCollectionHandle)?.label ?? "";

      const payload: ReviewPayload = {
        productId: form.productId || undefined,
        shopifyProductId: form.shopifyProductId || undefined,
        productHandle: form.productHandle || undefined,
        productUrl: form.productUrl || undefined,
        productLogoUrl: form.productLogoUrl || undefined,
        officialUrl: form.officialUrl || undefined,
        productName: form.productName,
        vendorName: form.vendorName,
        categoryKey: form.categoryKey,
        ratings: form.ratings,
        recommend: form.recommend,
        reviewTitle: form.reviewTitle,
        reviewBody: form.reviewBody,
        visibility: form.visibility,
        submittedFrom: "user_portal_workspace",
        metadata: {
          selectedTopCategory: form.selectedTopCategory,
          selectedTopCategoryLabel,
          selectedSubcategory: form.selectedSubcategory,
          selectedSubcategoryLabel,
          selectedCollectionHandle: form.selectedCollectionHandle,
          selectedCollectionLabel,
        },
      };

      if (activeReview?.id) {
        await updateReview(activeReview.id, payload);
        pushToast("Review updated.", "success");
      } else {
        await createReview(payload);
        pushToast("Review published.", "success");
      }

      resetForm(form.categoryKey);
      await loadReviews();
    } catch {
      pushToast("Review could not be saved right now.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function removeReview(id: string) {
    try {
      await deleteReview(id);
      setReviewPendingDelete(null);
      pushToast("Review removed.", "success");
      if (activeReviewId === id) {
        resetForm(form.categoryKey);
      }
      await loadReviews();
    } catch {
      pushToast("Review could not be removed right now.", "error");
    }
  }

  async function sendThreadMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeReviewId || !threadMessage.trim()) return;
    try {
      const updatedThread = await addReviewThreadMessage(activeReviewId, threadMessage.trim());
      setThreadMessage("");
      setReviews((current) =>
        (current ?? []).map((item) => (item.id === activeReviewId ? { ...item, ...updatedThread } : item))
      );
      pushToast("Reply added to the review thread.", "success");
    } catch {
      pushToast("Reply could not be sent right now.", "error");
    }
  }

  async function reportActiveReview() {
    if (!activeReview) return;
    try {
      await reportReview(activeReview.id, {
        reason: "Workspace moderation review requested",
        details: "Requested from My Reviews workspace.",
      });
      pushToast("Review flagged for moderation review.", "success");
      await loadReviews();
    } catch {
      pushToast("Review could not be reported right now.", "error");
    }
  }

  if (!reviews) {
    return <LoadingSkeleton lines={10} />;
  }

  const approvedCount = reviews.filter((item) => item.status === "approved").length;
  const averageScore = reviews.length ? (reviews.reduce((total, item) => total + item.overallRating, 0) / reviews.length).toFixed(1) : "0.0";
  const reviewTypeLabel = catalog.categories.find((item) => item.key === form.categoryKey)?.label ?? "Common";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Review System"
        title="Enterprise review workspace"
        description="Create structured reviews, manage product context, track moderation status, and keep every vendor conversation connected to the original product feedback."
        actions={<StatusBadge label={`${reviews.length} total reviews`} tone="dark" />}
      />

      {loadError ? (
        <EmptyState
          title="Reviews are temporarily unavailable"
          description="The workspace loaded with fallback behavior because the review service did not respond successfully."
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_25px_80px_-55px_rgba(15,23,42,0.25)]">
          <div className="flex items-center gap-3 text-slate-500">
            <ChartNoAxesColumn className="h-5 w-5 text-sky-600" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">Published footprint</span>
          </div>
          <p className="mt-5 text-4xl font-semibold text-slate-950">{reviews.length}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">Reviews authored across product pages and your workspace.</p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_25px_80px_-55px_rgba(15,23,42,0.25)]">
          <div className="flex items-center gap-3 text-slate-500">
            <BadgeCheck className="h-5 w-5 text-emerald-600" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">Approved reviews</span>
          </div>
          <p className="mt-5 text-4xl font-semibold text-slate-950">{approvedCount}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">Visible reviews currently contributing to storefront trust and product proof.</p>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_25px_80px_-55px_rgba(15,23,42,0.25)]">
          <div className="flex items-center gap-3 text-slate-500">
            <Star className="h-5 w-5 text-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">Average score</span>
          </div>
          <p className="mt-5 text-4xl font-semibold text-slate-950">{averageScore}</p>
          <p className="mt-2 text-sm leading-7 text-slate-600">Average overall rating across your published and draft-quality feedback.</p>
        </div>
      </section>

      <div className="grid gap-6 2xl:grid-cols-[1.1fr_1fr]">
        <section className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-[0_35px_100px_-65px_rgba(15,23,42,0.3)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                <Sparkles className="h-4 w-4" />
                Review portfolio
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-slate-950">My Reviews</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                Use this panel to track all of your published trust signals, thread activity, and review quality across software, cloud, and AI product categories.
              </p>
            </div>
            <button
              type="button"
              onClick={startNewReview}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              New review
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {reviews.length === 0 ? (
              <EmptyState
                title="Your review portfolio is ready"
                description="Start with a structured product review and ITMart24 will keep the category scoring, moderation state, and conversation history organized for you."
              />
            ) : (
              reviews.map((review) => (
                <article
                  key={review.id}
                  className={`rounded-[28px] border p-5 transition ${
                    activeReviewId === review.id ? "border-slate-900 bg-slate-950 text-white" : "border-slate-200 bg-slate-50/70"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <button type="button" onClick={() => setActiveReviewId(review.id)} className="text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`text-lg font-semibold ${activeReviewId === review.id ? "text-white" : "text-slate-950"}`}>{review.reviewTitle}</h3>
                        <StatusBadge
                          label={String(review.status ?? "approved").replace(/_/g, " ")}
                          tone={review.status === "approved" ? "success" : review.status === "pending" ? "warning" : "info"}
                        />
                        {review.isVerifiedReviewer ? <StatusBadge label="Verified reviewer" tone="info" /> : null}
                        {review.isProductUser ? <StatusBadge label="Product in use" tone="success" /> : null}
                      </div>
                      <p className={`mt-2 text-sm font-medium ${activeReviewId === review.id ? "text-slate-300" : "text-slate-600"}`}>
                        {review.productName} by {review.vendorName}
                      </p>
                      <p className={`mt-3 text-sm leading-7 ${activeReviewId === review.id ? "text-slate-200" : "text-slate-600"}`}>
                        {review.reviewBody}
                      </p>
                    </button>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void startEdit(review)}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
                          activeReviewId === review.id ? "border-white/15 bg-white/10 text-white" : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setReviewPendingDelete(review)}
                        className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className={`mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${activeReviewId === review.id ? "text-slate-300" : "text-slate-600"}`}>
                    <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">Overall</p>
                      <p className={`mt-2 text-2xl font-semibold ${activeReviewId === review.id ? "text-white" : "text-slate-950"}`}>{review.overallRating.toFixed(1)}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">Helpful</p>
                      <p className={`mt-2 text-2xl font-semibold ${activeReviewId === review.id ? "text-white" : "text-slate-950"}`}>{review.helpfulCount}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">Not helpful</p>
                      <p className={`mt-2 text-2xl font-semibold ${activeReviewId === review.id ? "text-white" : "text-slate-950"}`}>{review.notHelpfulCount}</p>
                    </div>
                    <div className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]">Thread updates</p>
                      <p className={`mt-2 text-2xl font-semibold ${activeReviewId === review.id ? "text-white" : "text-slate-950"}`}>{review.threadMessageCount}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {review.ratingBreakdown.map((dimension) => (
                      <span
                        key={dimension.key}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          activeReviewId === review.id ? "bg-white/10 text-slate-100" : "bg-white text-slate-700"
                        }`}
                      >
                        {dimension.label}: {dimension.value.toFixed(1)}
                      </span>
                    ))}
                  </div>

                  <div className={`mt-4 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.18em] ${activeReviewId === review.id ? "text-slate-400" : "text-slate-500"}`}>
                    <span>{review.categoryKey.replace(/_/g, " ")}</span>
                    <span>{review.visibility === "anonymous_display_name" ? "Display name protected" : "Public attribution"}</span>
                    <span>Published {formatDate(review.createdAt)}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <form ref={formRef} onSubmit={submitReview} className="rounded-[34px] border border-white/10 bg-[#050a1d] p-6 text-white shadow-[0_40px_110px_-70px_rgba(2,6,23,0.95)]">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 text-sky-300" />
              <div>
                <h2 className="text-2xl font-semibold">{activeReview ? "Edit strategic review" : "Create strategic review"}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-300">
                  Pick the exact ITMart24 collection first, then review a real catalog product with the matching scorecard.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2.5">
                <span className="text-sm font-semibold text-white">Category</span>
                <select
                  value={form.selectedTopCategory}
                  onChange={(event) => handleTopCategoryChange(event.target.value)}
                  className="portal-input bg-white text-slate-950"
                >
                  <option value="">Select category</option>
                  {topCategoryOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2.5">
                <span className="text-sm font-semibold text-white">Sub Category</span>
                <select
                  value={form.selectedSubcategory}
                  onChange={(event) => handleSubcategoryChange(event.target.value)}
                  className="portal-input bg-white text-slate-950"
                  disabled={!form.selectedTopCategory}
                >
                  <option value="">Select sub category</option>
                  {subcategoryOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2.5">
                <span className="text-sm font-semibold text-white">Collection</span>
                <select
                  value={form.selectedCollectionHandle}
                  onChange={(event) => void handleCollectionChange(event.target.value)}
                  className="portal-input bg-white text-slate-950"
                  disabled={!form.selectedSubcategory}
                >
                  <option value="">Select collection</option>
                  {collectionOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2.5">
                <span className="text-sm font-semibold text-white">Select Product</span>
                <select
                  value={form.productHandle}
                  onChange={(event) => handleProductChange(event.target.value)}
                  className="portal-input bg-white text-slate-950"
                  disabled={!form.selectedCollectionHandle || collectionProductsLoading}
                >
                  <option value="">
                    {collectionProductsLoading ? "Loading products..." : "Select product"}
                  </option>
                  {collectionProducts.map((item) => (
                    <option key={item.productHandle} value={item.productHandle}>
                      {item.productName}
                    </option>
                  ))}
                </select>
              </label>

              <ReadonlyField label="Vendor name" value={form.vendorName || (selectedProduct?.vendorName ?? "")} />
              <ReadonlyField label="Review Type" value={reviewTypeLabel} />
              <ReadonlyField label="Product handle" value={form.productHandle} />
              <ReadonlyField label="Shopify product id" value={form.shopifyProductId} />
              <ReadonlyField label="Product URL" value={form.productUrl} className="md:col-span-2" />
              <FormField label="Review title" labelClassName="text-white" value={form.reviewTitle} onChange={(event) => setForm({ ...form, reviewTitle: event.target.value })} className="md:col-span-2" />
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">Scoring framework</h3>
                  <p className="mt-1 text-sm text-slate-300">The rating sliders adapt automatically to the selected category and collection.</p>
                </div>
                <StatusBadge label={category.label} tone="info" />
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {category.dimensions.map((dimension) => (
                  <label key={dimension.key} className="rounded-[22px] border border-white/10 bg-slate-950/50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-100">{dimension.label}</span>
                      <span className="text-sm font-semibold text-sky-300">{form.ratings[dimension.key] ?? 5}.0</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={String(form.ratings[dimension.key] ?? 5)}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          ratings: {
                            ...form.ratings,
                            [dimension.key]: Number(event.target.value),
                          },
                        })
                      }
                      className="mt-3 w-full accent-sky-400"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <FormField
                as="textarea"
                label="Review body"
                labelClassName="text-white"
                rows={7}
                value={form.reviewBody}
                onChange={(event) => setForm({ ...form, reviewBody: event.target.value })}
                className="bg-white/5 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <label className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <span className="block font-semibold text-white">Display mode</span>
                <select
                  value={form.visibility}
                  onChange={(event) => setForm({ ...form, visibility: event.target.value as ReviewFormState["visibility"] })}
                  className="mt-2 w-full bg-transparent text-slate-200 outline-none"
                >
                  <option value="public" className="text-slate-950">
                    Public profile
                  </option>
                  <option value="anonymous_display_name" className="text-slate-950">
                    Protected display name
                  </option>
                </select>
              </label>

              <label className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <div>
                  <span className="block font-semibold text-white">Recommendation signal</span>
                  <span className="mt-1 block text-xs text-slate-400">Show whether you would recommend this product to another buyer.</span>
                </div>
                <input type="checkbox" checked={form.recommend} onChange={(event) => setForm({ ...form, recommend: event.target.checked })} />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={
                  isSubmitting ||
                  !form.selectedTopCategory ||
                  !form.selectedSubcategory ||
                  !form.selectedCollectionHandle ||
                  !form.productHandle
                }
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
              >
                <Star className="h-4 w-4" />
                {isSubmitting ? "Saving..." : activeReview ? "Update review" : "Publish review"}
              </button>
              <button type="button" onClick={() => resetForm(form.categoryKey)} className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white">
                Clear form
              </button>
            </div>
          </form>

          <div className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-[0_35px_100px_-65px_rgba(15,23,42,0.3)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-sky-600" />
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Conversation & trust signals</h2>
                  <p className="mt-1 text-sm text-slate-600">Vendor responses and moderation follow-up stay linked to the selected review.</p>
                </div>
              </div>
              {activeReview ? (
                <button type="button" onClick={() => void reportActiveReview()} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
                  <Flag className="h-4 w-4" />
                  Report
                </button>
              ) : null}
            </div>

            {activeReview ? (
              <>
                <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-950">{activeReview.reviewTitle}</h3>
                    <StatusBadge label={activeReview.threadStatus.replace(/_/g, " ")} tone="info" />
                    <StatusBadge label={`${activeReview.helpfulCount} helpful`} tone="success" />
                    <StatusBadge label={`${activeReview.notHelpfulCount} not helpful`} tone="warning" />
                    {activeReview.reportCount > 0 ? <StatusBadge label={`${activeReview.reportCount} reports`} tone="warning" /> : null}
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {activeReview.productName} by {activeReview.vendorName}. Last updated {formatDate(activeReview.updatedAt)}.
                  </p>
                </div>

                <div className="mt-5 space-y-3">
                  {activeReview.messages?.length ? (
                    activeReview.messages.map((message) => (
                      <div key={message.id} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          {message.sender_type === "user" ? <ShieldCheck className="h-4 w-4 text-sky-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                          {message.sender_type === "user" ? "You" : "Vendor or moderator"}
                        </div>
                        <p className="mt-2 text-sm leading-7 text-slate-700">{message.message}</p>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="No thread activity yet"
                      description="Once a vendor or moderator replies, the full conversation history will stay here beside the original review."
                    />
                  )}
                </div>

                <form onSubmit={sendThreadMessage} className="mt-5 space-y-3">
                  <textarea
                    value={threadMessage}
                    onChange={(event) => setThreadMessage(event.target.value)}
                    rows={4}
                    className="w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-300"
                    placeholder="Add a follow-up note or reply to the thread"
                  />
                  <button className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
                    <Send className="h-4 w-4" />
                    Send reply
                  </button>
                </form>
              </>
            ) : (
              <EmptyState
                title="Select a review"
                description="Choose one of your reviews to inspect its trust signals, thread history, and moderation options."
              />
            )}
          </div>
        </aside>
      </div>

      {reviewPendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_35px_100px_-65px_rgba(15,23,42,0.3)] md:p-7">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold text-slate-950">Delete this review?</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  <span className="font-semibold text-slate-900">{reviewPendingDelete.reviewTitle}</span> for{" "}
                  <span className="font-semibold text-slate-900">{reviewPendingDelete.productName}</span> will be removed from your review workspace.
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Use this only if you no longer want to keep this review in your account at all.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void removeReview(reviewPendingDelete.id)}
                className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-3 text-sm font-semibold text-white"
              >
                <Trash2 className="h-4 w-4" />
                Confirm delete
              </button>
              <button
                type="button"
                onClick={() => setReviewPendingDelete(null)}
                className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700"
              >
                Keep review
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

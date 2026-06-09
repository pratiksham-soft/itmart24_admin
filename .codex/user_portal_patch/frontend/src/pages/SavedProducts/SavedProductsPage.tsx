import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlus, ExternalLink, Layers3, NotebookPen } from "lucide-react";
import { EmptyState } from "../../components/common/EmptyState";
import { FormField } from "../../components/common/FormField";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { PageHeader } from "../../components/common/PageHeader";
import { SavedStorefrontProductCard } from "../../components/common/SavedStorefrontProductCard";
import { SearchFilterBar } from "../../components/common/SearchFilterBar";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { useToast } from "../../hooks/useToast";
import { createProductInUse } from "../../services/productsInUse.service";
import { createSavedProduct, deleteSavedProduct, fetchSavedProductsPage, updateSavedProduct } from "../../services/savedProducts.service";

const initialExternalForm = {
  productName: "",
  vendorName: "",
  category: "",
  officialUrl: "",
  userNote: "",
};

const filters = ["All", "Shortlisted", "Recently Saved", "Internal ITMart24 Products", "External Products"] as const;
const PAGE_SIZE = 9;

export function SavedProductsPage() {
  const { pushToast } = useToast();
  const externalFormRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [pagination, setPagination] = useState<{
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("All");
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [externalForm, setExternalForm] = useState(initialExternalForm);

  const apiFilter = useMemo(() => {
    if (activeFilter === "Shortlisted") return "shortlisted";
    if (activeFilter === "Internal ITMart24 Products") return "internal";
    if (activeFilter === "External Products") return "external";
    if (activeFilter === "Recently Saved") return "recent";
    return "all";
  }, [activeFilter]);

  async function loadItems(page = 1) {
    setLoading(true);
    try {
      const result = await fetchSavedProductsPage({
        page,
        pageSize: PAGE_SIZE,
        search,
        filter: apiFilter,
      });
      setItems(result.items);
      setPagination(result.pagination);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems(1);
  }, [apiFilter, search]);

  function openExternalProductSection() {
    setShowExternalForm(true);
    requestAnimationFrame(() => {
      externalFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleExternalSubmit(event: FormEvent) {
    event.preventDefault();
    const created = await createSavedProduct({
      productName: externalForm.productName,
      vendorName: externalForm.vendorName,
      category: externalForm.category || "External tool",
      officialUrl: externalForm.officialUrl,
      userNote: externalForm.userNote,
      productLogoUrl: "",
      status: "saved",
      isShortlisted: false,
      metadata: {
        source: "manual_external",
        sourceLabel: "External product",
        userTags: [],
      },
    });
    setItems((current) => [created, ...current].slice(0, PAGE_SIZE));
    setPagination((current) => current ? { ...current, totalItems: current.totalItems + 1 } : current);
    setExternalForm(initialExternalForm);
    setShowExternalForm(false);
    pushToast("External product saved to your research workspace.", "success");
  }

  async function handleShortlist(item: any) {
    const updated = await updateSavedProduct(item.id, {
      productId: item.product_id ?? "",
      shopifyProductId: item.shopify_product_id ?? "",
      productHandle: item.product_handle ?? item.metadata?.productHandle ?? "",
      productUrl: item.product_url ?? item.metadata?.productUrl ?? "",
      productName: item.product_name,
      vendorName: item.vendor_name,
      category: item.category,
      productLogoUrl: item.product_logo_url ?? "",
      officialUrl: item.official_url ?? "",
      userNote: item.user_note ?? "",
      status: item.status,
      isShortlisted: !(item.is_shortlisted || item.metadata?.shortlistStatus === "shortlisted"),
      metadata: {
        ...(item.metadata ?? {}),
        shortlistStatus: item.is_shortlisted || item.metadata?.shortlistStatus === "shortlisted" ? "saved" : "shortlisted",
        source: item.metadata?.source ?? (item.product_id || item.shopify_product_id ? "product_page" : "manual_external"),
      },
    });
    setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    pushToast(updated.is_shortlisted ? "Product shortlisted." : "Shortlist removed.", "success");
  }

  async function handleMoveToProducts(item: any) {
    await createProductInUse({
      productId: item.product_id ?? "",
      shopifyProductId: item.shopify_product_id ?? "",
      productName: item.product_name,
      vendorName: item.vendor_name,
      category: item.category,
      productLogoUrl: item.product_logo_url ?? "",
      officialUrl: item.official_url ?? "",
      subscriptionType: "",
      purchaseDate: "",
      expiryDate: "",
      renewalDate: "",
      billingPeriod: "yearly",
      reminderDaysBefore: 30,
      status: "active",
      metadata: {
        source: "saved_product",
        savedProductId: item.id,
      },
    });
    pushToast("Product moved into Products I Use. Add subscription details next.", "success");
  }

  async function handleDelete(item: any) {
    await deleteSavedProduct(item.id);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setPagination((current) => current ? { ...current, totalItems: Math.max(0, current.totalItems - 1) } : current);
    pushToast("Saved product removed.", "success");
  }

  if (loading && !pagination) {
    return <LoadingSkeleton lines={5} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Research" title="Saved Products" description="Products you saved from ITMart24 for later research, shortlisting, and follow-up decisions." actions={<><StatusBadge label={`${pagination?.totalItems ?? items.length} saved`} tone="info" /><button onClick={openExternalProductSection} className="portal-button-secondary">Add External Product</button></>} />
      <SearchFilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search saved products, vendors, or categories..." filters={filters.map((filter) => <button key={filter} onClick={() => setActiveFilter(filter)} className={["portal-chip", activeFilter === filter ? "border-sky-300 bg-sky-50 text-sky-700" : ""].join(" ")}>{filter}</button>)} actions={<a href="https://itmart24.com/" target="_blank" rel="noreferrer" className="portal-button-primary"><BookmarkPlus className="h-4 w-4" />Browse Products</a>} />

      <SectionCard title="Saved from ITMart24" description="This space is built for products you save while browsing ITMart24 product cards, product pages, comparisons, and recommendations." actions={pagination ? <StatusBadge label={`Page ${pagination.page} of ${pagination.totalPages}`} tone="neutral" /> : null}>
        {items.length === 0 && !loading ? <EmptyState title="Save products while browsing ITMart24" description="Click the save icon on any ITMart24 product to keep it here for later. You can then add notes, shortlist it, or move it into Products I Use." actions={<><button className="portal-button-primary">Browse Products</button><button className="portal-button-secondary">View Comparisons</button><button onClick={openExternalProductSection} className="portal-button-secondary">Add External Product</button></>} /> : <div className="space-y-5">{items.map((item) => <SavedStorefrontProductCard key={item.id} item={item} onAddToShortlist={() => void handleShortlist(item)} onMoveToProducts={() => void handleMoveToProducts(item)} onDelete={() => void handleDelete(item)} />)}</div>}
        {pagination && pagination.totalPages > 1 ? <div className="mt-6 flex flex-col gap-3 border-t border-slate-200/70 pt-5 md:flex-row md:items-center md:justify-between"><p className="text-sm text-slate-600">Showing most recent saved products first. {pagination.totalItems} total saved products.</p><div className="flex flex-wrap gap-3"><button onClick={() => void loadItems(pagination.page - 1)} disabled={!pagination.hasPreviousPage || loading} className="portal-button-secondary disabled:cursor-not-allowed disabled:opacity-50">Previous</button><button onClick={() => void loadItems(pagination.page + 1)} disabled={!pagination.hasNextPage || loading} className="portal-button-secondary disabled:cursor-not-allowed disabled:opacity-50">Next</button></div></div> : null}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard title="How saved products work" description="The primary flow is simple: save first while browsing, then organize later when you are ready.">
          <div className="grid gap-4">
            <div className="portal-section p-4"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><BookmarkPlus className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-slate-900">1. Save from ITMart24</p><p className="mt-2 text-sm leading-7 text-slate-600">Click the save icon on a product card, product page, recommendation card, or comparison page.</p></div></div></div>
            <div className="portal-section p-4"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><Layers3 className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-slate-900">2. Organize your research</p><p className="mt-2 text-sm leading-7 text-slate-600">Add notes, shortlist promising tools, or keep products grouped by vendor and category.</p></div></div></div>
            <div className="portal-section p-4"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><NotebookPen className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-slate-900">3. Move into active tracking</p><p className="mt-2 text-sm leading-7 text-slate-600">When a saved product becomes something you actually use, move it into Products I Use and add only subscription details.</p></div></div></div>
          </div>
        </SectionCard>

        {showExternalForm ? <div ref={externalFormRef}><SectionCard title="Add external product" description="Only use this when a product is not listed on ITMart24."><form onSubmit={handleExternalSubmit} className="grid gap-4"><FormField label="Product name" value={externalForm.productName} onChange={(event) => setExternalForm({ ...externalForm, productName: event.target.value })} /><FormField label="Vendor or company" value={externalForm.vendorName} onChange={(event) => setExternalForm({ ...externalForm, vendorName: event.target.value })} /><FormField label="Website URL" value={externalForm.officialUrl} onChange={(event) => setExternalForm({ ...externalForm, officialUrl: event.target.value })} /><FormField label="Category" value={externalForm.category} onChange={(event) => setExternalForm({ ...externalForm, category: event.target.value })} /><FormField label="Private note" as="textarea" value={externalForm.userNote} onChange={(event) => setExternalForm({ ...externalForm, userNote: event.target.value })} /><button className="portal-button-primary">Save external product</button></form></SectionCard></div> : <SectionCard title="Secondary manual option" description="Most saved products should arrive here automatically from ITMart24. Use manual entry only for tools not currently listed in the marketplace."><button onClick={openExternalProductSection} className="portal-button-secondary"><ExternalLink className="h-4 w-4" />Add product not listed on ITMart24</button></SectionCard>}
      </div>
    </div>
  );
}

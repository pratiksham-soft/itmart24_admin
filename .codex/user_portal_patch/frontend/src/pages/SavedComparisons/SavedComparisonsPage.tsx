import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "../../components/common/EmptyState";
import { ComparisonCard } from "../../components/common/ComparisonCard";
import { FormField } from "../../components/common/FormField";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { PageHeader } from "../../components/common/PageHeader";
import { SearchFilterBar } from "../../components/common/SearchFilterBar";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { useToast } from "../../hooks/useToast";
import { createSavedComparison, deleteSavedComparison, fetchSavedComparisons, getComparisonExportUrl } from "../../services/savedComparisons.service";

const emptyItem = { productName: "", vendorName: "", officialUrl: "" };
const filters = ["All", "Favorites", "Recently Saved", "Cloud Services", "AI Tools", "Custom Comparisons"] as const;

export function SavedComparisonsPage() {
  const { pushToast } = useToast();
  const manualBuilderRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<any[] | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("All");
  const [showManualBuilder, setShowManualBuilder] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [products, setProducts] = useState([emptyItem, emptyItem]);

  async function loadItems() {
    setItems(await fetchSavedComparisons());
  }

  useEffect(() => {
    void loadItems();
  }, []);

  function openManualBuilder() {
    setShowManualBuilder(true);
    requestAnimationFrame(() => {
      manualBuilderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function removeProductRow(index: number) {
    setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  const filteredItems = useMemo(() => {
    const sourceItems = items ?? [];
    return sourceItems.filter((item) => {
      const query = search.trim().toLowerCase();
      const matchesSearch = !query || [item.title, item.category, item.notes].some((value) => String(value ?? "").toLowerCase().includes(query));
      let matchesFilter = activeFilter === "All";
      if (!matchesFilter && activeFilter === "Favorites") matchesFilter = Boolean(item.is_favorite);
      if (!matchesFilter && activeFilter === "Recently Saved") matchesFilter = true;
      if (!matchesFilter && activeFilter === "Custom Comparisons") matchesFilter = !item.source_url;
      if (!matchesFilter && (activeFilter === "Cloud Services" || activeFilter === "AI Tools")) {
        matchesFilter = String(item.category ?? "").toLowerCase().includes(activeFilter.toLowerCase().replace(" services", "").replace(" tools", ""));
      }
      return matchesSearch && matchesFilter;
    });
  }, [activeFilter, items, search]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      title,
      category,
      notes,
      isFavorite: false,
      sourceUrl: "",
      items: products.filter((item) => item.productName.trim()).map((item, index) => ({ ...item, position: index })),
    };
    const created = await createSavedComparison(payload);
    setItems((current) => [created, ...(current ?? [])]);
    setTitle("");
    setCategory("");
    setNotes("");
    setProducts([emptyItem, emptyItem]);
    setShowManualBuilder(false);
    pushToast("Comparison saved. Advanced exports stay free for all users.", "success");
  }

  async function handleDelete(item: any) {
    await deleteSavedComparison(item.id);
    setItems((current) => (current ?? []).filter((entry) => entry.id !== item.id));
    pushToast("Saved comparison removed.", "success");
  }

  if (!items) {
    return <LoadingSkeleton lines={5} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Research" title="Saved Comparisons" description="Your saved product comparisons, research notes, and exportable decision reports." actions={<><StatusBadge label="Unlimited saves" tone="success" /><button onClick={openManualBuilder} className="portal-button-secondary">Create Custom Comparison</button></>} />
      <SearchFilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search comparisons, categories, or notes..." filters={filters.map((filter) => <button key={filter} onClick={() => setActiveFilter(filter)} className={["portal-chip", activeFilter === filter ? "border-sky-300 bg-sky-50 text-sky-700" : ""].join(" ")}>{filter}</button>)} actions={<a href="https://itmart24.com/pages/comparison" target="_blank" rel="noreferrer" className="portal-button-primary">Browse Comparisons</a>} />

      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <SectionCard title="Saved from ITMart24" description="Saved comparison pages should arrive here from ITMart24 cards, detail pages, and comparison views.">
          {filteredItems.length === 0 ? <EmptyState title="Save comparison pages while browsing ITMart24" description="Save unlimited comparisons and export reports whenever you need. You can also create a custom comparison when the built-in pages are not enough." actions={<><button className="portal-button-primary">Browse Comparisons</button><button onClick={openManualBuilder} className="portal-button-secondary">Create Custom Comparison</button></>} /> : <div className="space-y-4">{filteredItems.map((item) => <ComparisonCard key={item.id} item={item} onDelete={() => void handleDelete(item)} exportUrls={{ csv: getComparisonExportUrl(item.id, "csv"), pdf: getComparisonExportUrl(item.id, "pdf") }} />)}</div>}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Comparison workflow" description="The primary experience is save-first, organize-later. Manual setup is available, but it is not the expected default path.">
            <div className="grid gap-4">
              <div className="portal-section p-4"><p className="text-sm font-semibold text-slate-900">Save directly from comparison pages</p><p className="mt-2 text-sm leading-7 text-slate-600">When you click save on an ITMart24 comparison page, the title, source page, and compared-product snapshot should arrive automatically.</p></div>
              <div className="portal-section p-4"><p className="text-sm font-semibold text-slate-900">Export without friction</p><p className="mt-2 text-sm leading-7 text-slate-600">Advanced comparison exports are free for all users. No premium gate, no upgrade prompt.</p></div>
              <div className="portal-section p-4"><p className="text-sm font-semibold text-slate-900">Custom comparisons stay secondary</p><p className="mt-2 text-sm leading-7 text-slate-600">Manual custom comparison creation is useful when needed, but saved marketplace comparisons remain the main user story.</p></div>
            </div>
          </SectionCard>

          {showManualBuilder ? <div ref={manualBuilderRef}><SectionCard title="Create custom comparison" description="Use this only when you need a comparison that does not already exist on ITMart24."><form onSubmit={handleSubmit} className="space-y-4"><FormField label="Comparison title" value={title} onChange={(e) => setTitle(e.target.value)} /><FormField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} /><FormField label="Research note" as="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />{products.map((product, index) => <div key={index} className="portal-section p-4"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-900">Product {index + 1}</p>{products.length > 2 ? <button type="button" onClick={() => removeProductRow(index)} className="text-sm font-semibold text-rose-600 transition hover:text-rose-700">Remove product</button> : null}</div><div className="grid gap-3"><FormField label="Product name" value={product.productName} onChange={(e) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productName: e.target.value } : item))} /><FormField label="Vendor" value={product.vendorName} onChange={(e) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, vendorName: e.target.value } : item))} /><FormField label="Official URL" value={product.officialUrl} onChange={(e) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, officialUrl: e.target.value } : item))} /></div></div>)}<div className="flex flex-wrap gap-3"><button type="button" onClick={() => setProducts((current) => [...current, emptyItem])} className="portal-button-secondary">Add another product</button><button className="portal-button-primary">Save custom comparison</button></div></form></SectionCard></div> : <SectionCard title="Manual comparison builder" description="Keep this as a useful secondary option for special cases or external products."><button onClick={openManualBuilder} className="portal-button-secondary">Open custom comparison builder</button></SectionCard>}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import Badge from "../../components/ui/badge/Badge";
import { Modal } from "../../components/ui/modal";
import { API_BASE_URL } from "../../config/api";

type Props = {
  isOpen: boolean;
  vendorId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
};

type Vendor = Record<string, unknown> & {
  id: string;
  businessName?: string;
  contactName?: string;
  country?: string;
  businessType?: string;
  onboardingStatus?: string;
  agreement?: boolean;
  taxRegistered?: string;
  logoUrl?: string;
  coverPhotoUrl?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  socialProof?: Record<string, unknown>;
  media?: Record<string, unknown>;
};

type TabId = "overview" | "contact" | "business" | "media" | "social" | "advanced";

const tabs: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contact", label: "Contact" },
  { id: "business", label: "Business" },
  { id: "media", label: "Media" },
  { id: "social", label: "Social" },
  { id: "advanced", label: "Advanced" },
];

const inputClass =
  "w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const VendorDetailsModal = ({ isOpen, vendorId, onClose, onUpdated }: Props) => {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [draft, setDraft] = useState<Vendor | null>(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !vendorId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}`);
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to fetch vendor details");
        }
        const normalized = normalizeVendor(result.data);
        if (!cancelled) {
          setVendor(normalized);
          setDraft(normalized);
          setJsonDraft(JSON.stringify(normalized, null, 2));
          setActiveTab("overview");
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch vendor details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, vendorId]);

  useEffect(() => {
    if (!isOpen) {
      setVendor(null);
      setDraft(null);
      setJsonDraft("");
      setMessage(null);
      setError(null);
      setLoading(false);
      setSaving(false);
    }
  }, [isOpen]);

  const setValue = (path: string, value: unknown) => {
    setDraft((prev) => (prev ? setPath(prev, path.split("."), value) : prev));
    setMessage(null);
    setError(null);
  };

  const applyJson = () => {
    try {
      const parsed = normalizeVendor(JSON.parse(jsonDraft));
      setDraft(parsed);
      setJsonDraft(JSON.stringify(parsed, null, 2));
      setMessage("Advanced JSON applied.");
      setError(null);
      return parsed;
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Invalid JSON");
      return null;
    }
  };

  const handleSave = async () => {
    if (!vendorId || !draft) return;
    const payload = activeTab === "advanced" ? applyJson() : draft;
    if (!payload) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to update vendor");
      }
      const normalized = normalizeVendor(result.data);
      setVendor(normalized);
      setDraft(normalized);
      setJsonDraft(JSON.stringify(normalized, null, 2));
      setMessage("Vendor updated successfully.");
      onUpdated?.();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update vendor");
    } finally {
      setSaving(false);
    }
  };

  const links = useMemo(() => collectHeaderLinks(draft), [draft]);
  const logoUrl = text(draft?.logoUrl) || text(getNested(draft, "media.companyLogo.url"));
  const coverUrl = text(draft?.coverPhotoUrl) || text(getNested(draft, "media.coverPhoto.url"));
  const introVideoUrl = text(draft?.introVideoUrl);

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false} className="m-4 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[1280px]">
      <div className="flex h-full flex-col overflow-hidden rounded-[28px] bg-white dark:bg-gray-900">
        <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-800 lg:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40">
                {logoUrl ? <img src={logoUrl} alt={text(draft?.businessName) || "Vendor logo"} className="h-full w-full object-cover" /> : <span className="px-3 text-center text-xs text-gray-400">No logo</span>}
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Vendor Workspace</p>
                  <h3 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{loading && !draft ? "Loading..." : text(draft?.businessName) || "Unnamed Vendor"}</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{text(draft?.contactName) || "Contact not available"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {text(draft?.onboardingStatus) && <Badge size="sm" color={badgeColor(text(draft?.onboardingStatus))}>{text(draft?.onboardingStatus).replace("-", " ")}</Badge>}
                  <Badge size="sm" color={text(draft?.taxRegistered) === "yes" ? "success" : "light"}>Tax {text(draft?.taxRegistered) || "unknown"}</Badge>
                  <Badge size="sm" color={draft?.agreement ? "success" : "warning"}>Agreement {draft?.agreement ? "accepted" : "pending"}</Badge>
                </div>
                <div className="grid gap-2 text-sm text-gray-500 dark:text-gray-400 sm:grid-cols-3">
                  <Meta label="Vendor ID" value={vendor?.id ?? "-"} />
                  <Meta label="Created" value={formatDate(vendor?.createdAt)} />
                  <Meta label="Updated" value={formatDate(vendor?.updatedAt)} />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 xl:items-end">
              <div className="flex flex-wrap gap-2 xl:justify-end">
                {links.slice(0, 4).map((link) => (
                  <button key={link.url} type="button" onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")} className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                    {link.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 xl:justify-end">
                <button type="button" onClick={onClose} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Close</button>
                <button type="button" onClick={handleSave} disabled={saving || loading || !draft} className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
          {(message || error) && <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${error ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"}`}>{error || message}</div>}
        </div>

        <div className="border-b border-gray-200 px-5 dark:border-gray-800 lg:px-7">
          <div className="custom-scrollbar flex gap-2 overflow-x-auto py-3">
            {tabs.map((tab) => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${activeTab === tab.id ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300" : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800/40"}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5 lg:px-7 lg:py-6">
          {loading && <Card title="Loading"><p className="text-sm text-gray-500 dark:text-gray-400">Fetching the full Firestore vendor record.</p></Card>}
          {!loading && draft && (
            <div className="space-y-6">
              {activeTab === "overview" && <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]">
                <Card title="Company Overview"><div className="grid gap-5 md:grid-cols-2">
                  <Field label="Business Name"><Input value={text(draft.businessName)} onChange={(v) => setValue("businessName", v)} /></Field>
                  <Field label="Business Type"><Input value={text(draft.businessType)} onChange={(v) => setValue("businessType", v)} /></Field>
                  <Field label="Country"><Input value={text(draft.country)} onChange={(v) => setValue("country", v)} /></Field>
                  <Field label="Onboarding Status"><Select value={text(draft.onboardingStatus)} onChange={(v) => setValue("onboardingStatus", v)} options={["registered", "pending", "approved", "rejected"]} /></Field>
                  <div className="md:col-span-2"><Field label="About"><TextArea value={text(draft.about)} rows={6} onChange={(v) => setValue("about", v)} /></Field></div>
                </div></Card>
                <Card title="Visual Summary"><div className="space-y-4"><Preview label="Logo" url={logoUrl} compact fit="contain" /><Preview label="Cover Photo" url={coverUrl} /></div></Card>
              </div>}

              {activeTab === "contact" && <Card title="Contact & Reachability"><div className="grid gap-5 md:grid-cols-2">
                <Field label="Contact Name"><Input value={text(draft.contactName)} onChange={(v) => setValue("contactName", v)} /></Field>
                <Field label="Contact Email"><Input type="email" value={text(draft.contactEmail)} onChange={(v) => setValue("contactEmail", v)} /></Field>
                <Field label="Contact Phone"><Input value={text(draft.contactPhone)} onChange={(v) => setValue("contactPhone", v)} /></Field>
                <Field label="Public Email"><Input type="email" value={text(draft.email)} onChange={(v) => setValue("email", v)} /></Field>
                <Field label="Public Phone"><Input value={text(draft.phone)} onChange={(v) => setValue("phone", v)} /></Field>
                <Field label="Website"><Input value={text(draft.website)} onChange={(v) => setValue("website", v)} /></Field>
                <div className="md:col-span-2"><Field label="Address"><TextArea value={text(draft.address)} rows={4} onChange={(v) => setValue("address", v)} /></Field></div>
              </div></Card>}

              {activeTab === "business" && <div className="grid gap-6 xl:grid-cols-[1.3fr,0.7fr]">
                <Card title="Business Details"><div className="grid gap-5 md:grid-cols-2">
                  <Field label="Registration Number"><Input value={text(draft.regNo)} onChange={(v) => setValue("regNo", v)} /></Field>
                  <Field label="Tax Registration"><Select value={text(draft.taxRegistered)} onChange={(v) => setValue("taxRegistered", v)} options={["yes", "no"]} /></Field>
                  <Field label="Tax Number"><Input value={text(draft.taxNumber)} onChange={(v) => setValue("taxNumber", v)} /></Field>
                  <Field label="Auth Provider"><Input value={text(draft.authProvider)} onChange={(v) => setValue("authProvider", v)} /></Field>
                </div></Card>
                <Card title="Admin Controls"><label className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-gray-800 dark:bg-gray-800/40"><input type="checkbox" checked={Boolean(draft.agreement)} onChange={(e) => setValue("agreement", e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" /><div><p className="text-sm font-semibold text-gray-900 dark:text-white">Agreement Accepted</p><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Controls whether the vendor agreement is marked as accepted.</p></div></label></Card>
              </div>}

              {activeTab === "media" && <div className="space-y-6">
                <Card title="Primary Media"><div className="grid gap-5 md:grid-cols-2">
                  <Field label="Logo URL"><Input value={text(draft.logoUrl)} onChange={(v) => setValue("logoUrl", v)} /></Field>
                  <Field label="Cover Photo URL"><Input value={text(draft.coverPhotoUrl)} onChange={(v) => setValue("coverPhotoUrl", v)} /></Field>
                  <div className="md:col-span-2"><Field label="Intro Video URL"><Input value={text(draft.introVideoUrl)} onChange={(v) => setValue("introVideoUrl", v)} /></Field></div>
                </div></Card>
                <div className="grid gap-6 xl:grid-cols-2">
                  <Card title="Company Logo Asset"><div className="space-y-5"><Preview label="Logo Preview" url={text(getNested(draft, "media.companyLogo.url"))} compact fit="contain" /><div className="grid gap-5 md:grid-cols-2">
                    <Field label="Company Logo URL"><Input value={text(getNested(draft, "media.companyLogo.url"))} onChange={(v) => setValue("media.companyLogo.url", v)} /></Field>
                    <Field label="Shopify File ID"><Input value={text(getNested(draft, "media.companyLogo.shopifyFileId"))} onChange={(v) => setValue("media.companyLogo.shopifyFileId", v)} /></Field>
                  </div></div></Card>
                  <Card title="Cover Photo Asset"><div className="space-y-5"><Preview label="Cover Preview" url={text(getNested(draft, "media.coverPhoto.url"))} /><div className="grid gap-5 md:grid-cols-2">
                    <Field label="Cover Photo URL"><Input value={text(getNested(draft, "media.coverPhoto.url"))} onChange={(v) => setValue("media.coverPhoto.url", v)} /></Field>
                    <Field label="Shopify File ID"><Input value={text(getNested(draft, "media.coverPhoto.shopifyFileId"))} onChange={(v) => setValue("media.coverPhoto.shopifyFileId", v)} /></Field>
                  </div></div></Card>
                  <Card title="Intro Video"><VideoPreview url={introVideoUrl} /></Card>
                </div>
              </div>}

              {activeTab === "social" && <Card title="Social Proof & Distribution"><div className="grid gap-5 md:grid-cols-2">
                {["youtube", "github", "twitter", "facebook", "instagram", "linkedin"].map((key) => {
                  const url = text(getNested(draft, `socialProof.${key}`));
                  return (
                    <Field key={key} label={labelize(key)}>
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <Input value={url} onChange={(v) => setValue(`socialProof.${key}`, v)} />
                        </div>
                        <button
                          type="button"
                          disabled={!url}
                          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                          className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          Open
                        </button>
                      </div>
                    </Field>
                  );
                })}
              </div></Card>}

              {activeTab === "advanced" && <div className="grid gap-6 xl:grid-cols-[0.8fr,1.2fr]">
                <Card title="System Metadata"><div className="space-y-4">
                  <Meta label="Vendor ID" value={vendor?.id ?? "-"} />
                  <Meta label="Created At" value={formatDate(vendor?.createdAt)} />
                  <Meta label="Updated At" value={formatDate(vendor?.updatedAt)} />
                  <Meta label="Guidance" value="Use this editor only for fields not covered in the structured tabs. Save will merge this JSON into Firestore." />
                </div></Card>
                <Card title="Advanced JSON Editor"><div className="space-y-4">
                  <TextArea value={jsonDraft} rows={20} onChange={setJsonDraft} className="font-mono text-xs" />
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => setJsonDraft(JSON.stringify(draft, null, 2))} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Reset JSON</button>
                    <button type="button" onClick={applyJson} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Apply JSON</button>
                  </div>
                </div></Card>
              </div>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900/60"><h4 className="mb-5 text-base font-semibold text-gray-900 dark:text-white">{title}</h4>{children}</section>;
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{label}</span>{children}</label>;
const Input = ({ value, onChange, type = "text" }: { value: string; onChange: (value: string) => void; type?: string }) => <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
const TextArea = ({ value, onChange, rows, className = "" }: { value: string; onChange: (value: string) => void; rows: number; className?: string }) => <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} resize-y ${className}`} />;
const Select = ({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) => <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}><option value="">Select an option</option>{options.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}</select>;
const Meta = ({ label, value }: { label: string; value: string }) => <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-800/40"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{label}</p><p className="mt-1 break-words text-sm text-gray-700 dark:text-gray-200">{value}</p></div>;
const Preview = ({ label, url, compact = false, fit = "cover" }: { label: string; url: string; compact?: boolean; fit?: "cover" | "contain" }) => <div className="overflow-hidden rounded-3xl border border-gray-200 dark:border-gray-800"><div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800"><p className="text-sm font-semibold text-gray-800 dark:text-white">{label}</p></div>{url ? <div className="flex items-center justify-center bg-gray-50 p-4 dark:bg-gray-800/30"><img src={url} alt={label} className={`${compact ? "max-h-40" : "max-h-56"} w-full ${fit === "contain" ? "object-contain" : "object-cover"}`} /></div> : <div className="flex h-40 items-center justify-center bg-gray-50 px-4 text-sm text-gray-400 dark:bg-gray-800/30">No preview available</div>}</div>;
const VideoPreview = ({ url }: { url: string }) => {
  const embedUrl = toEmbedUrl(url);
  if (!url) {
    return <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50 px-4 text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800/30">No intro video URL provided.</div>;
  }
  if (embedUrl) {
    return <div className="overflow-hidden rounded-3xl border border-gray-200 dark:border-gray-800"><div className="aspect-video bg-black"><iframe src={embedUrl} title="Intro Video" className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div></div>;
  }
  return <div className="overflow-hidden rounded-3xl border border-gray-200 dark:border-gray-800"><div className="aspect-video bg-black"><video src={url} controls className="h-full w-full object-contain" /></div></div>;
};

const normalizeVendor = (value: unknown): Vendor => {
  const base = isRecord(value) ? value : {};
  const socialProof = isRecord(base.socialProof) ? base.socialProof : {};
  const media = isRecord(base.media) ? base.media : {};
  return {
    ...base,
    id: text(base.id),
    socialProof: { youtube: "", github: "", twitter: "", facebook: "", instagram: "", linkedin: "", ...socialProof },
    media: { companyLogo: { url: "", width: "", height: "", shopifyFileId: "", ...(isRecord(media.companyLogo) ? media.companyLogo : {}) }, coverPhoto: { url: "", width: "", height: "", shopifyFileId: "", ...(isRecord(media.coverPhoto) ? media.coverPhoto : {}) }, ...media },
  } as Vendor;
};

const setPath = <T,>(value: T, path: string[], nextValue: unknown): T => {
  if (path.length === 0) return nextValue as T;
  const [head, ...tail] = path;
  const current = isRecord(value) ? value[head] : undefined;
  return { ...(value as Record<string, unknown>), [head]: tail.length ? setPath(isRecord(current) ? current : {}, tail, nextValue) : nextValue } as T;
};

const getNested = (value: unknown, path: string) => path.split(".").reduce<unknown>((acc, key) => (isRecord(acc) ? acc[key] : undefined), value);
const collectLinks = (value: unknown) => {
  const items: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown, path: string[] = []) => {
    if (typeof node === "string" && /^https?:\/\//i.test(node) && !seen.has(node)) {
      seen.add(node);
      items.push({ label: path.filter((part) => Number.isNaN(Number(part))).map(labelize).join(" / ") || "Open Link", url: node });
      return;
    }
    if (Array.isArray(node)) return node.forEach((entry, index) => walk(entry, [...path, String(index)]));
    if (isRecord(node)) Object.entries(node).forEach(([key, nested]) => walk(nested, [...path, key]));
  };
  walk(value);
  return items;
};
const collectHeaderLinks = (value: unknown) =>
  collectLinks(value).filter((item) => {
    const label = item.label.toLowerCase();
    return !label.includes("logo") && !label.includes("cover photo") && !label.includes("intro video") && !label.includes("social proof");
  });

const badgeColor = (status: string) => status === "registered" || status === "approved" ? "success" : status === "pending" ? "warning" : status === "rejected" ? "error" : "info";
const formatDate = (value: unknown) => typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : typeof value === "string" ? value : "-";
const text = (value: unknown) => value === null || value === undefined ? "" : String(value);
const labelize = (value: string) => value.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (match) => match.toUpperCase());
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const toEmbedUrl = (url: string) => {
  if (!url) return "";
  const youtubeMatch =
    url.match(/youtube\.com\/watch\?v=([^&]+)/i) ||
    url.match(/youtu\.be\/([^?&/]+)/i) ||
    url.match(/youtube\.com\/embed\/([^?&/]+)/i);
  if (youtubeMatch?.[1]) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/i);
  if (vimeoMatch?.[1]) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  return "";
};

export default VendorDetailsModal;

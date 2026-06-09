import { FormEvent, useEffect, useRef, useState } from "react";
import { AxiosError } from "axios";
import { useLocation } from "react-router-dom";
import { FormField } from "../../components/common/FormField";
import { LoadingSkeleton } from "../../components/common/LoadingSkeleton";
import { PageHeader } from "../../components/common/PageHeader";
import { SectionCard } from "../../components/common/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge";
import { useToast } from "../../hooks/useToast";
import { useAuth } from "../../hooks/useAuth";
import { fetchReviewerVerificationStatus, submitReviewerVerification, uploadReviewerId } from "../../services/reviewerVerification.service";
import { fetchPreferences, fetchProfile, sendEmailVerificationOtp, updatePreferences, updateProfile, verifyEmailVerificationOtp } from "../../services/user.service";

const categories = ["AI tools", "Hosting", "CRM", "Marketing tools", "Productivity software", "Developer tools", "Security tools", "Business software"];

function toneForStatus(status: string) {
  if (status === "verified") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "rejected") return "warning" as const;
  return "info" as const;
}

function getErrorMessage(error: unknown) {
  if (error instanceof AxiosError) {
    return String(error.response?.data?.message ?? error.message ?? "Request failed.");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed.";
}

export function SettingsPage() {
  const { pushToast } = useToast();
  const { refreshUser } = useAuth();
  const location = useLocation();
  const emailSectionRef = useRef<HTMLDivElement | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [preferences, setPreferences] = useState<any | null>(null);
  const [verification, setVerification] = useState<any | null>(null);
  const [documentType, setDocumentType] = useState("Photo ID");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [busyAction, setBusyAction] = useState<"upload" | "submit" | null>(null);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailBusyAction, setEmailBusyAction] = useState<"send" | "verify" | null>(null);
  const [otpSent, setOtpSent] = useState(false);

  async function loadData() {
    const [profileResult, preferencesResult, verificationResult] = await Promise.all([
      fetchProfile(),
      fetchPreferences(),
      fetchReviewerVerificationStatus(),
    ]);
    setProfile(profileResult);
    setPreferences(preferencesResult);
    setVerification(verificationResult);
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (location.hash !== "#email-verification") {
      return;
    }

    requestAnimationFrame(() => {
      emailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash]);

  if (!profile || !preferences || !verification) {
    return <LoadingSkeleton lines={10} />;
  }

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    try {
      const payload = {
        fullName: profile.full_name ?? profile.fullName,
        phone: profile.phone || "",
        country: profile.country || "",
        companyName: profile.company_name || "",
        companyCountry: profile.company_country || "",
        companyAddress: profile.company_address || "",
        companyContactDetails: profile.company_contact_details || "",
        companyTaxDetails: profile.company_tax_details || "",
        companyGstNumber: profile.company_gst_number || "",
        jobRole: profile.job_role || "",
        avatarUrl: profile.avatar_url || "",
        publicReviewDisplayName: profile.public_review_display_name || "",
      };
      const result = await updateProfile(payload);
      setProfile(result);
      pushToast("Profile updated successfully.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  }

  async function submitPreferences(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await updatePreferences({
        interestedCategories: preferences.interested_categories ?? preferences.interestedCategories ?? [],
        recommendationPreferences: preferences.recommendation_preferences ?? preferences.recommendationPreferences ?? {},
        emailNotificationsEnabled: preferences.email_notifications_enabled ?? true,
        inAppNotificationsEnabled: preferences.in_app_notifications_enabled ?? true,
        renewalRemindersEnabled: preferences.renewal_reminders_enabled ?? true,
        reviewReplyNotificationsEnabled: preferences.review_reply_notifications_enabled ?? true,
        rewardNotificationsEnabled: preferences.reward_notifications_enabled ?? true,
        marketingEmailsEnabled: preferences.marketing_emails_enabled ?? false,
        newsletterEnabled: preferences.newsletter_enabled ?? false,
        anonymousReviewsEnabled: preferences.anonymous_reviews_enabled ?? false,
        dataExportRequested: preferences.data_export_requested ?? false,
        deleteAccountRequested: preferences.delete_account_requested ?? false,
      });
      setPreferences(result);
      pushToast("Preferences saved successfully.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusyAction("upload");
    try {
      const result = await uploadReviewerId(file);
      setVerification(result);
      setSelectedFileName(file.name);
      pushToast("Photo ID uploaded securely.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setBusyAction(null);
      event.target.value = "";
    }
  }

  async function handleVerificationSubmit() {
    setBusyAction("submit");
    try {
      const result = await submitReviewerVerification({ documentType });
      setVerification(result);
      pushToast("Verification request submitted.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendOtp() {
    setEmailBusyAction("send");
    try {
      const result = await sendEmailVerificationOtp();
      setOtpSent(true);
      pushToast(result.message || "Verification OTP sent.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setEmailBusyAction(null);
    }
  }

  async function handleVerifyOtp() {
    setEmailBusyAction("verify");
    try {
      const result = await verifyEmailVerificationOtp(emailOtp);
      setProfile(result);
      await refreshUser();
      setEmailOtp("");
      setOtpSent(false);
      pushToast("Email verified successfully.", "success");
    } catch (error) {
      pushToast(getErrorMessage(error), "error");
    } finally {
      setEmailBusyAction(null);
    }
  }

  const selectedCategories = preferences.interested_categories ?? [];
  const verificationStatus = String(verification.status ?? "not_submitted");
  const companyCountry = String(profile.company_country ?? "").trim().toLowerCase();
  const showGstField = companyCountry === "india" || companyCountry === "in";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="My Settings" title="Profile, preferences, and trust settings" description="Manage account details, notification rules, and reviewer verification from one clearer settings experience." actions={<StatusBadge label={profile.email_verified ? "Email verified" : "Email verification pending"} tone={profile.email_verified ? "success" : "warning"} />} />

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <SectionCard title="Profile" description="Keep your account identity accurate so recommendations, communication, and review attribution stay useful.">
            <form onSubmit={submitProfile} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Full name" value={profile.full_name ?? ""} onChange={(event) => setProfile({ ...profile, full_name: event.target.value })} />

                <div ref={emailSectionRef} className="space-y-2.5 md:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">Email</span>
                    {profile.email_verified ? <StatusBadge label="Verified" tone="success" /> : <StatusBadge label="Pending verification" tone="warning" />}
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <input value={profile.email ?? ""} disabled className="portal-input w-full bg-white/80" />
                      {!profile.email_verified ? (
                        <button type="button" onClick={() => void handleSendOtp()} disabled={emailBusyAction !== null} className="portal-button-secondary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50">
                          {emailBusyAction === "send" ? "Sending OTP..." : otpSent ? "Resend OTP" : "Send OTP"}
                        </button>
                      ) : null}
                    </div>

                    {!profile.email_verified ? (
                      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center">
                        <input
                          value={emailOtp}
                          onChange={(event) => setEmailOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="Enter 6-digit OTP"
                          className="portal-input w-full lg:max-w-56"
                        />
                        <button type="button" onClick={() => void handleVerifyOtp()} disabled={emailOtp.length !== 6 || emailBusyAction !== null} className="portal-button-primary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50">
                          {emailBusyAction === "verify" ? "Verifying..." : "Verify email"}
                        </button>
                      </div>
                    ) : null}

                    <p className="mt-3 text-xs leading-6 text-slate-500">Verification OTPs are sent from `noreply@itmart24.com` and expire in 10 minutes.</p>
                  </div>
                </div>

                <FormField label="Phone" value={profile.phone ?? ""} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
                <FormField label="Country" value={profile.country ?? ""} onChange={(event) => setProfile({ ...profile, country: event.target.value })} />
                <FormField label="Job role" value={profile.job_role ?? ""} onChange={(event) => setProfile({ ...profile, job_role: event.target.value })} />
                <FormField label="Avatar URL" value={profile.avatar_url ?? ""} onChange={(event) => setProfile({ ...profile, avatar_url: event.target.value })} />
                <FormField label="Public review display name" value={profile.public_review_display_name ?? ""} onChange={(event) => setProfile({ ...profile, public_review_display_name: event.target.value })} />
              </div>
              <button className="portal-button-primary">Save profile</button>
            </form>
          </SectionCard>

          <SectionCard title="Add Company Details" description="Save the billing identity you want to appear on invoices and checkout records.">
            <form onSubmit={submitProfile} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Company name" value={profile.company_name ?? ""} onChange={(event) => setProfile({ ...profile, company_name: event.target.value })} />
                <FormField label="Company country" value={profile.company_country ?? ""} onChange={(event) => setProfile({ ...profile, company_country: event.target.value })} hint="Use India or IN to require GST on invoice details." />
                <div className="md:col-span-2">
                  <FormField label="Company address" as="textarea" value={profile.company_address ?? ""} onChange={(event) => setProfile({ ...profile, company_address: event.target.value })} hint="Registered or billing address to print on invoices." />
                </div>
                <FormField label="Contact details" as="textarea" value={profile.company_contact_details ?? ""} onChange={(event) => setProfile({ ...profile, company_contact_details: event.target.value })} hint="Phone, billing email, or contact person details." />
                <FormField label="Tax details" as="textarea" value={profile.company_tax_details ?? ""} onChange={(event) => setProfile({ ...profile, company_tax_details: event.target.value })} hint="PAN, VAT, or any invoice note you want preserved." />
                {showGstField ? <FormField label="GST number" value={profile.company_gst_number ?? ""} onChange={(event) => setProfile({ ...profile, company_gst_number: event.target.value.toUpperCase() })} hint="Required for companies billing from India." /> : null}
              </div>
              <button className="portal-button-primary">Save company details</button>
            </form>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Preferences" description="Choose the categories and alerts that matter most so your workspace feels relevant, not noisy." tone="dark">
            <form onSubmit={submitPreferences} className="space-y-6">
              <div>
                <p className="text-sm font-semibold text-white">Interested categories</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {categories.map((category) => {
                    const selected = selectedCategories.includes(category);
                    return (
                      <button
                        type="button"
                        key={category}
                        onClick={() => setPreferences({ ...preferences, interested_categories: selected ? selectedCategories.filter((item: string) => item !== category) : [...selectedCategories, category] })}
                        className={["rounded-full border px-4 py-2 text-sm font-medium transition", selected ? "border-sky-300 bg-sky-500/20 text-sky-200" : "border-white/10 bg-white/5 text-slate-300"].join(" ")}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                {[
                  ["email_notifications_enabled", "Email notifications", "Receive account and activity summaries by email."],
                  ["in_app_notifications_enabled", "In-app notifications", "Show workspace alerts inside the portal."],
                  ["renewal_reminders_enabled", "Renewal reminders", "Get reminders before products renew or expire."],
                  ["review_reply_notifications_enabled", "Review reply notifications", "Hear back when vendors respond to your reviews."],
                  ["reward_notifications_enabled", "Reward notifications", "See when points or redemptions change."],
                  ["marketing_emails_enabled", "Marketing emails", "Receive optional product and platform promotions."],
                ].map(([key, label, hint]) => (
                  <label key={key} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{label}</p>
                      <p className="mt-1 text-xs leading-6 text-slate-400">{hint}</p>
                    </div>
                    <input type="checkbox" checked={Boolean(preferences[key])} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} className="portal-checkbox mt-1" />
                  </label>
                ))}
              </div>

              <button className="portal-button-secondary bg-white text-slate-950">Save preferences</button>
            </form>
          </SectionCard>

          <SectionCard title="Become a Verified Reviewer" description="Verification improves trust across public reviews while keeping your identity document private.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-2xl text-sm leading-7 text-slate-600">Upload a JPG, PNG, or PDF under 5MB. Only authorized internal reviewers should ever access the original file.</div>
              <StatusBadge label={verificationStatus.replace(/_/g, " ")} tone={toneForStatus(verificationStatus)} />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-[0.92fr_1.08fr]">
              <div className="portal-section p-5">
                <p className="text-sm font-semibold text-slate-900">Verification status</p>
                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p>Uploaded document: {verification.hasDocument ? (selectedFileName || "Securely stored") : "Not uploaded yet"}</p>
                  <p>Document type: {verification.documentType || "Not selected"}</p>
                  <p>Submitted: {verification.submittedAt ? new Date(verification.submittedAt).toLocaleString() : "Not submitted yet"}</p>
                </div>
                {verification.rejectionReason ? <p className="mt-4 rounded-[18px] bg-amber-50 px-4 py-3 text-sm text-amber-800">Rejection reason: {verification.rejectionReason}</p> : null}
              </div>

              <div className="portal-subtle-card p-5">
                <label className="space-y-2.5">
                  <span className="text-sm font-semibold text-slate-800">Document type</span>
                  <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="portal-input portal-select">
                    <option>Photo ID</option>
                    <option>Passport</option>
                    <option>Driving License</option>
                    <option>Government ID</option>
                  </select>
                </label>

                <label className="mt-4 block text-sm font-semibold text-slate-800">
                  <span className="mb-2 block">Upload photo ID</span>
                  <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => void handleFileChange(event)} className="portal-input block w-full file:mr-4 file:rounded-full file:border-0 file:bg-sky-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-sky-700" />
                </label>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={() => void handleVerificationSubmit()} disabled={!verification.hasDocument || busyAction !== null || verificationStatus === "pending"} className="portal-button-primary disabled:cursor-not-allowed disabled:opacity-40">
                    {busyAction === "submit" ? "Submitting..." : verificationStatus === "rejected" ? "Re-submit for review" : "Submit for verification"}
                  </button>
                  <div className="portal-chip">{busyAction === "upload" ? "Uploading securely..." : verification.hasDocument ? "Document ready" : "Upload required"}</div>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

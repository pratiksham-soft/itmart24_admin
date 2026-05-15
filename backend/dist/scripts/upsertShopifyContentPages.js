"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env");
const firebaseAdmin_1 = require("../config/firebaseAdmin");
const shopifyHttp_1 = require("../services/shopifyHttp");
const VENDOR_PAGE_ID = "124057551087";
const VENDOR_PORTAL_URL = "https://vendor.itmart24.com";
const PLAN_PRESENTATION = {
    free: {
        kicker: "For First Listings",
        badge: "Free Access",
        badgeVariant: null,
        summary: "Launch a clean marketplace presence with the essentials buyers expect when they first discover your product.",
        ctaLabel: "Start Free",
    },
    starter: {
        kicker: "For Early Traction",
        badge: "Starter",
        badgeVariant: null,
        summary: "Add visibility signals and lightweight analytics so you can learn what attracts attention and clicks.",
        ctaLabel: "Get Started",
    },
    business: {
        kicker: "For Growing Vendors",
        badge: "Most Popular",
        badgeVariant: "popular",
        summary: "Strengthen buyer trust with badges, branded presence, richer placement, and clearer product comparison visibility.",
        ctaLabel: "Get Started",
    },
    enterprise: {
        kicker: "For Maximum Reach",
        badge: "Enterprise",
        badgeVariant: "premium",
        summary: "Unlock premium exposure, AI-ready discovery surfaces, deeper analytics, and higher-priority support for larger growth goals.",
        ctaLabel: "Get Started",
    },
};
const escapeHtml = (value) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const slugifyToken = (value) => value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "period";
const normalizePlanFeature = (feature, index) => {
    if (typeof feature === "string") {
        const title = feature.trim();
        return {
            title: title || `Feature ${index + 1}`,
            description: "",
        };
    }
    const title = feature?.title?.trim() || `Feature ${index + 1}`;
    const description = feature?.description?.trim() || "";
    return { title, description };
};
const getPeriodSortRank = (period) => {
    const label = period.label?.trim().toLowerCase() ?? "";
    if (label.includes("month")) {
        return 1;
    }
    if (label.includes("quarter")) {
        return 2;
    }
    if (label.includes("year") || label.includes("annual")) {
        return 3;
    }
    const durationInMonths = typeof period.durationInMonths === "number" ? period.durationInMonths : 0;
    if (durationInMonths > 0) {
        return durationInMonths;
    }
    return 99;
};
const getTermLabel = (label) => {
    const normalized = label.trim().toLowerCase();
    if (normalized.includes("month")) {
        return "/ month";
    }
    if (normalized.includes("quarter")) {
        return "/ quarter";
    }
    if (normalized.includes("year") || normalized.includes("annual")) {
        return "/ year";
    }
    return "/ term";
};
const formatPrice = (price) => {
    if (price === 0) {
        return "Free";
    }
    return `$${price.toLocaleString("en-US", {
        minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
        maximumFractionDigits: 2,
    })}`;
};
const normalizeVendorPagePlan = (plan, index) => {
    const name = plan.name?.trim() || "";
    const slug = plan.slug?.trim() || plan.id?.trim() || slugifyToken(name);
    if (!name || !slug || plan.isActive === false) {
        return null;
    }
    const rawPeriods = Array.isArray(plan.periods) ? plan.periods : [];
    const periods = rawPeriods
        .filter((period) => Boolean(period && typeof period.price === "number"))
        .sort((left, right) => getPeriodSortRank(left) - getPeriodSortRank(right))
        .map((period, periodIndex) => {
        const label = period.label?.trim() || `Option ${periodIndex + 1}`;
        const normalizedLabel = label.toLowerCase();
        const key = normalizedLabel.includes("month")
            ? "monthly"
            : normalizedLabel.includes("year") || normalizedLabel.includes("annual")
                ? "yearly"
                : normalizedLabel.includes("quarter")
                    ? "quarterly"
                    : `option-${periodIndex + 1}`;
        return {
            id: period.id?.trim() || `${slug}-period-${periodIndex + 1}`,
            key,
            label,
            price: typeof period.price === "number" ? period.price : 0,
            termLabel: getTermLabel(label),
        };
    });
    const features = (Array.isArray(plan.features) ? plan.features : [])
        .map(normalizePlanFeature)
        .filter((feature) => feature.title);
    if (periods.length === 0) {
        return null;
    }
    const presentation = PLAN_PRESENTATION[slug] ?? {
        kicker: "For Marketplace Growth",
        badge: null,
        badgeVariant: null,
        summary: "Choose the feature set that best fits how much visibility, trust, and buyer engagement you want to unlock.",
        ctaLabel: `Choose ${name}`,
    };
    return {
        id: plan.id?.trim() || slug,
        name,
        slug,
        sortOrder: typeof plan.sortOrder === "number" ? plan.sortOrder : index + 1,
        kicker: presentation.kicker,
        badge: presentation.badge,
        badgeVariant: presentation.badgeVariant,
        summary: presentation.summary,
        ctaLabel: presentation.ctaLabel,
        periods,
        features,
    };
};
const renderFeatureItem = (feature) => {
    const title = escapeHtml(feature.title);
    const description = escapeHtml(feature.description);
    if (!description) {
        return `<li><strong>${title}</strong></li>`;
    }
    return `<li><strong>${title}</strong><span>${description}</span></li>`;
};
const renderPlanPeriodSelector = (plan) => {
    if (plan.periods.length <= 1) {
        return "";
    }
    return `
    <div class="vendor-pricing-page__toggle" data-toggle-for="${escapeHtml(plan.slug)}-pricing">
      ${plan.periods
        .map((period, index) => `
            <button
              type="button"
              ${index === 0 ? 'class="is-active"' : ""}
              data-mode-btn="${escapeHtml(period.key)}"
            >
              ${escapeHtml(period.label)}
            </button>
          `)
        .join("")}
    </div>
  `.trim();
};
const renderPlanPricing = (plan) => {
    return `
    <div
      class="vendor-pricing-page__pricing"
      id="${escapeHtml(plan.slug)}-pricing"
    >
      ${plan.periods
        .map((period, index) => `
            <div
              class="vendor-pricing-page__price-panel ${index === 0 ? "is-active" : ""}"
              data-price-mode="${escapeHtml(period.key)}"
            >
              <span class="vendor-pricing-page__price-label">${escapeHtml(period.label)} billing</span>
              <div class="vendor-pricing-page__price-row">
                <span class="vendor-pricing-page__main-price">${escapeHtml(formatPrice(period.price))}</span>
                <span class="vendor-pricing-page__price-term">${escapeHtml(period.termLabel)}</span>
              </div>
            </div>
          `)
        .join("")}
    </div>
  `.trim();
};
const renderPlanCard = (plan) => {
    const planClasses = [
        "vendor-pricing-page__plan",
        plan.badgeVariant ? `vendor-pricing-page__plan--${plan.badgeVariant}` : "",
    ]
        .filter(Boolean)
        .join(" ");
    const badgeClass = [
        "vendor-pricing-page__plan-badge",
        plan.badgeVariant
            ? `vendor-pricing-page__plan-badge--${plan.badgeVariant}`
            : "",
    ]
        .filter(Boolean)
        .join(" ");
    const shouldCollapseFeatures = plan.features.length > 6;
    const featuresClass = [
        "vendor-pricing-page__features",
        shouldCollapseFeatures
            ? "vendor-pricing-page__features--collapsible"
            : "",
    ]
        .filter(Boolean)
        .join(" ");
    return `
    <article class="${planClasses}">
      <div class="vendor-pricing-page__plan-top">
        <div>
          <span class="vendor-pricing-page__plan-kicker">${escapeHtml(plan.kicker)}</span>
        </div>
        ${plan.badge
        ? `<span class="${badgeClass}">${escapeHtml(plan.badge)}</span>`
        : ""}
      </div>

      <h3>${escapeHtml(plan.name)} Plan</h3>
      <p class="vendor-pricing-page__plan-copy">${escapeHtml(plan.summary)}</p>

      ${renderPlanPeriodSelector(plan)}
      ${renderPlanPricing(plan)}

      <ul class="${featuresClass}" ${shouldCollapseFeatures ? "data-collapsible-list" : ""}>
        ${plan.features.map(renderFeatureItem).join("")}
      </ul>

      ${shouldCollapseFeatures
        ? '<button class="vendor-pricing-page__more" type="button" data-collapsible-toggle>View all features</button>'
        : ""}

      <div class="vendor-pricing-page__cta">
        <a
          class="vendor-pricing-page__button ${plan.badgeVariant === "popular"
        ? "vendor-pricing-page__button--primary"
        : "vendor-pricing-page__button--secondary"}"
          href="${VENDOR_PORTAL_URL}"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${escapeHtml(plan.ctaLabel)}
        </a>
      </div>
    </article>
  `.trim();
};
const buildVendorPageHtml = (plans) => `
  <style>
    .main-page-title.page-title {
      display: none !important;
    }

    .page-width.page-width--narrow.section-template--21833919725807__main-padding {
      max-width: min(1280px, 100%) !important;
      padding-left: 2rem !important;
      padding-right: 2rem !important;
    }

    .page-width.page-width--narrow.section-template--21833919725807__main-padding > .rte {
      max-width: none !important;
      margin: 0 !important;
    }

    .vendor-pricing-page {
      --vp-accent: #5b8cff;
      --vp-accent-strong: #3f72ff;
      --vp-accent-soft: rgba(91, 140, 255, 0.14);
      --vp-fg-rgb: var(--color-foreground);
      --vp-text: rgb(var(--vp-fg-rgb));
      --vp-muted: rgba(var(--vp-fg-rgb), 0.74);
      --vp-soft-text: rgba(var(--vp-fg-rgb), 0.62);
      --vp-surface: rgba(var(--vp-fg-rgb), 0.035);
      --vp-surface-strong: rgba(var(--vp-fg-rgb), 0.06);
      --vp-border: rgba(var(--vp-fg-rgb), 0.08);
      --vp-border-strong: rgba(91, 140, 255, 0.34);
      color: var(--vp-text);
      padding: 2.5rem 0 5rem;
    }

    .vendor-pricing-page * {
      box-sizing: border-box;
    }

    .vendor-pricing-page a {
      color: inherit;
      text-decoration: none;
    }

    .vendor-pricing-page__shell {
      width: 100%;
      margin: 0 auto;
    }

    .vendor-pricing-page__hero {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.9fr);
      gap: 2.25rem;
      align-items: start;
      padding: 0 0 3rem;
      border-bottom: 1px solid var(--vp-border);
    }

    .vendor-pricing-page__eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      color: var(--vp-muted);
      font-size: 0.88rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .vendor-pricing-page__eyebrow-dot {
      width: 0.6rem;
      height: 0.6rem;
      border-radius: 999px;
      background: linear-gradient(135deg, var(--vp-accent), #89a8ff);
      box-shadow: 0 0 0 0.35rem rgba(91, 140, 255, 0.14);
    }

    .vendor-pricing-page__hero h1,
    .vendor-pricing-page__section-head h2,
    .vendor-pricing-page__side-title,
    .vendor-pricing-page__plan h3 {
      color: var(--vp-text);
    }

    .vendor-pricing-page__hero h1 {
      margin: 0 0 1rem;
      max-width: 14ch;
      font-size: clamp(3.25rem, 5.8vw, 5rem);
      line-height: 0.98;
      letter-spacing: 0;
    }

    .vendor-pricing-page__hero p,
    .vendor-pricing-page__side-copy,
    .vendor-pricing-page__plan-copy,
    .vendor-pricing-page__section-head p,
    .vendor-pricing-page__policy-card p,
    .vendor-pricing-page__features li span {
      color: var(--vp-muted);
    }

    .vendor-pricing-page__hero p {
      margin: 0;
      max-width: 48rem;
      font-size: 1.12rem;
      line-height: 1.8;
    }

    .vendor-pricing-page__hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-top: 1.75rem;
    }

    .vendor-pricing-page__button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 3.25rem;
      padding: 0 1.5rem;
      border-radius: 0.95rem;
      font-size: 1rem;
      font-weight: 700;
      border: 1px solid transparent;
      transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    }

    .vendor-pricing-page__button:hover {
      transform: translateY(-1px);
    }

    .vendor-pricing-page__button--primary {
      color: #ffffff !important;
      background: linear-gradient(135deg, var(--vp-accent-strong), var(--vp-accent));
      box-shadow: 0 14px 30px rgba(63, 114, 255, 0.28);
    }

    .vendor-pricing-page__button--secondary {
      color: var(--vp-text) !important;
      border-color: rgba(var(--vp-fg-rgb), 0.14);
      background: rgba(var(--vp-fg-rgb), 0.045);
    }

    .vendor-pricing-page__proofs,
    .vendor-pricing-page__policy-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1rem;
    }

    .vendor-pricing-page__proof,
    .vendor-pricing-page__hero-side,
    .vendor-pricing-page__plan,
    .vendor-pricing-page__policy-card {
      border: 1px solid var(--vp-border);
      background: linear-gradient(180deg, rgba(var(--vp-fg-rgb), 0.04), rgba(var(--vp-fg-rgb), 0.02));
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
      backdrop-filter: blur(14px);
    }

    .vendor-pricing-page__proof {
      padding: 1.15rem 1.2rem;
      border-radius: 1.1rem;
      margin-top: 1.8rem;
    }

    .vendor-pricing-page__proof-label,
    .vendor-pricing-page__side-label,
    .vendor-pricing-page__price-label {
      display: block;
      margin-bottom: 0.4rem;
      color: var(--vp-soft-text);
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .vendor-pricing-page__proof strong {
      display: block;
      margin-bottom: 0.35rem;
      font-size: 1.18rem;
    }

    .vendor-pricing-page__proof span {
      font-size: 1rem;
      line-height: 1.6;
      color: var(--vp-muted);
    }

    .vendor-pricing-page__hero-side {
      border-radius: 1.4rem;
      padding: 1.75rem;
      overflow: hidden;
    }

    .vendor-pricing-page__hero-carousel {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 1rem;
    }

    .vendor-pricing-page__hero-track-wrap {
      position: relative;
      flex: 1;
      overflow: hidden;
      touch-action: pan-y;
    }

    .vendor-pricing-page__hero-track-wrap::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 1.2rem;
      pointer-events: none;
      box-shadow:
        inset 0 0 28px rgba(4, 10, 24, 0.42),
        inset 0 0 56px rgba(4, 10, 24, 0.24);
      background:
        linear-gradient(90deg, rgba(5, 10, 22, 0.18), transparent 12%, transparent 88%, rgba(5, 10, 22, 0.18)),
        linear-gradient(180deg, rgba(5, 10, 22, 0.14), transparent 14%, transparent 86%, rgba(5, 10, 22, 0.14));
    }

    .vendor-pricing-page__hero-track {
      display: flex;
      height: 100%;
      transition: transform 0.45s ease;
      transform: translateX(calc(var(--active-slide, 0) * -100%));
      will-change: transform;
      cursor: grab;
      user-select: none;
    }

    .vendor-pricing-page__hero-slide {
      flex: 0 0 100%;
      min-width: 100%;
      display: flex;
      flex-direction: column;
      gap: 1.4rem;
      min-height: 100%;
    }

    .vendor-pricing-page__hero-slide--founder,
    .vendor-pricing-page__hero-slide--visibility,
    .vendor-pricing-page__hero-slide--advantage {
      position: relative;
      padding: 1.35rem;
      border-radius: 1.2rem;
      background:
        radial-gradient(circle at top right, rgba(116, 95, 255, 0.22), transparent 45%),
        radial-gradient(circle at bottom left, rgba(47, 208, 255, 0.2), transparent 40%),
        linear-gradient(160deg, rgba(7, 14, 32, 0.92), rgba(10, 18, 38, 0.74));
      border: 1px solid rgba(133, 168, 255, 0.18);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 22px 44px rgba(2, 8, 24, 0.24),
        0 0 36px rgba(59, 130, 246, 0.16);
    }

    .vendor-pricing-page__hero-slide--visibility {
      background:
        radial-gradient(circle at top left, rgba(34, 211, 238, 0.22), transparent 42%),
        radial-gradient(circle at bottom right, rgba(96, 165, 250, 0.16), transparent 40%),
        linear-gradient(160deg, rgba(8, 18, 38, 0.94), rgba(7, 12, 28, 0.78));
    }

    .vendor-pricing-page__hero-slide--advantage {
      background:
        radial-gradient(circle at top right, rgba(129, 140, 248, 0.24), transparent 42%),
        radial-gradient(circle at bottom left, rgba(59, 130, 246, 0.2), transparent 38%),
        linear-gradient(160deg, rgba(12, 17, 39, 0.94), rgba(8, 12, 29, 0.78));
    }

    .vendor-pricing-page__hero-slide--founder::before,
    .vendor-pricing-page__hero-slide--visibility::before,
    .vendor-pricing-page__hero-slide--advantage::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(135deg, rgba(96, 165, 250, 0.08), rgba(139, 92, 246, 0.08));
      pointer-events: none;
    }

    .vendor-pricing-page__founder-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      height: 100%;
    }

    .vendor-pricing-page__offer-badge,
    .vendor-pricing-page__founder-badge {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      padding: 0.45rem 0.8rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #f8fbff;
      background: linear-gradient(135deg, rgba(34, 211, 238, 0.32), rgba(99, 102, 241, 0.32));
      border: 1px solid rgba(147, 197, 253, 0.26);
      box-shadow: 0 10px 24px rgba(59, 130, 246, 0.18);
    }

    .vendor-pricing-page__offer-title,
    .vendor-pricing-page__founder-title {
      margin: 0;
      font-size: clamp(2rem, 2.8vw, 2.5rem);
      line-height: 1.08;
    }

    .vendor-pricing-page__offer-copy,
    .vendor-pricing-page__founder-copy {
      margin: 0;
      font-size: 1.08rem;
      line-height: 1.6;
      color: rgba(232, 238, 255, 0.82);
    }

    .vendor-pricing-page__offer-grid,
    .vendor-pricing-page__founder-points {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.65rem 0.75rem;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    .vendor-pricing-page__offer-grid {
      gap: 0.8rem;
    }

    .vendor-pricing-page__offer-grid li,
    .vendor-pricing-page__founder-points li {
      display: flex;
      align-items: start;
      gap: 0.55rem;
      font-size: 0.95rem;
      line-height: 1.45;
      color: rgba(240, 245, 255, 0.9);
    }

    .vendor-pricing-page__founder-points li {
      font-size: 1.05rem;
      line-height: 1.5;
      padding: 0.82rem 0.9rem;
      border-radius: 1rem;
      background: rgba(9, 16, 36, 0.56);
      border: 1px solid rgba(137, 165, 255, 0.16);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .vendor-pricing-page__offer-grid li {
      padding: 0.82rem 0.9rem;
      border-radius: 1rem;
      background: rgba(9, 16, 36, 0.56);
      border: 1px solid rgba(137, 165, 255, 0.16);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }

    .vendor-pricing-page__offer-grid strong {
      display: block;
      margin-bottom: 0.22rem;
      font-size: 1.02rem;
      color: #f8fbff;
    }

    .vendor-pricing-page__founder-points strong {
      display: block;
      font-size: 1.06rem;
      color: #f8fbff;
    }

    .vendor-pricing-page__offer-grid span {
      display: block;
      font-size: 0.88rem;
      line-height: 1.4;
      color: rgba(220, 230, 255, 0.72);
    }

    .vendor-pricing-page__offer-grid li::before,
    .vendor-pricing-page__founder-points li::before {
      content: "";
      flex: 0 0 0.55rem;
      width: 0.55rem;
      height: 0.55rem;
      margin-top: 0.35rem;
      border-radius: 999px;
      background: linear-gradient(135deg, #67e8f9, #8b5cf6);
      box-shadow: 0 0 14px rgba(103, 232, 249, 0.45);
    }

    .vendor-pricing-page__offer-kicker {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      font-size: 0.92rem;
      color: rgba(197, 214, 255, 0.78);
    }

    .vendor-pricing-page__offer-kicker strong {
      font-size: 1rem;
      color: #f8fbff;
    }

    .vendor-pricing-page__offer-metric {
      display: inline-flex;
      align-items: center;
      padding: 0.45rem 0.7rem;
      border-radius: 999px;
      background: rgba(52, 211, 153, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.2);
      color: #b9ffe6;
      font-weight: 700;
    }

    .vendor-pricing-page__offer-actions,
    .vendor-pricing-page__founder-actions {
      margin-top: auto;
      padding-top: 0.25rem;
    }

    .vendor-pricing-page__offer-actions .vendor-pricing-page__button,
    .vendor-pricing-page__founder-actions .vendor-pricing-page__button {
      width: 100%;
      box-shadow: 0 12px 26px rgba(59, 130, 246, 0.24);
    }

    .vendor-pricing-page__offer-note {
      font-size: 0.92rem;
      line-height: 1.45;
      color: rgba(191, 209, 255, 0.78);
    }

    .vendor-pricing-page__hero-dots {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      padding-bottom: 0.15rem;
    }

    .vendor-pricing-page__hero-dot {
      width: 0.7rem;
      height: 0.7rem;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: rgba(191, 209, 255, 0.28);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
      cursor: pointer;
      transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    }

    .vendor-pricing-page__hero-dot.is-active {
      background: linear-gradient(135deg, var(--vp-accent-strong), #67e8f9);
      box-shadow: 0 0 18px rgba(103, 232, 249, 0.34);
      transform: scale(1.08);
    }

    .vendor-pricing-page__side-title {
      margin: 0 0 0.75rem;
      font-size: clamp(2rem, 2.8vw, 2.35rem);
      line-height: 1.15;
    }

    .vendor-pricing-page__side-copy {
      margin: 0;
      font-size: 1.08rem;
      line-height: 1.7;
    }

    .vendor-pricing-page__side-list {
      display: grid;
      gap: 1rem;
      margin-top: 1.4rem;
    }

    .vendor-pricing-page__side-item {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.9rem;
      align-items: start;
    }

    .vendor-pricing-page__side-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.2rem;
      height: 2.2rem;
      border-radius: 999px;
      font-size: 0.88rem;
      font-weight: 700;
      color: #ffffff;
      background: linear-gradient(135deg, var(--vp-accent-strong), var(--vp-accent));
    }

    .vendor-pricing-page__side-item strong {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 1.08rem;
    }

    .vendor-pricing-page__side-item span {
      font-size: 0.98rem;
      line-height: 1.6;
      color: var(--vp-muted);
    }

    .vendor-pricing-page__plans,
    .vendor-pricing-page__policy {
      padding-top: 3rem;
    }

    .vendor-pricing-page__section-head {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.85rem;
    }

    .vendor-pricing-page__section-head h2 {
      margin: 0;
      font-size: 2.45rem;
      line-height: 1.1;
    }

    .vendor-pricing-page__section-head p {
      margin: 0;
      max-width: 44rem;
      font-size: 1.08rem;
      line-height: 1.7;
    }

    .vendor-pricing-page__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.25rem;
    }

    .vendor-pricing-page__plan {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      padding: 1.75rem;
      border-radius: 1.35rem;
    }

    .vendor-pricing-page__plan--popular,
    .vendor-pricing-page__plan--premium {
      border-color: var(--vp-border-strong);
      box-shadow: 0 24px 54px rgba(0, 0, 0, 0.24);
    }

    .vendor-pricing-page__plan-top {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .vendor-pricing-page__plan-kicker,
    .vendor-pricing-page__plan-badge,
    .vendor-pricing-page__meta-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      font-size: 0.82rem;
      font-weight: 700;
    }

    .vendor-pricing-page__plan-kicker {
      padding: 0.45rem 0.78rem;
      color: var(--vp-muted);
      background: rgba(var(--vp-fg-rgb), 0.06);
    }

    .vendor-pricing-page__plan-badge {
      padding: 0.45rem 0.78rem;
      color: var(--vp-text);
      background: rgba(var(--vp-fg-rgb), 0.08);
    }

    .vendor-pricing-page__plan-badge--popular,
    .vendor-pricing-page__meta-pill--popular {
      color: #ffffff;
      background: linear-gradient(135deg, var(--vp-accent-strong), var(--vp-accent));
    }

    .vendor-pricing-page__plan-badge--premium {
      color: var(--vp-text);
      background: rgba(91, 140, 255, 0.14);
      border: 1px solid rgba(91, 140, 255, 0.32);
    }

    .vendor-pricing-page__plan h3 {
      margin: 0 0 0.6rem;
      font-size: 2rem;
      line-height: 1.1;
    }

    .vendor-pricing-page__plan-copy {
      margin: 0 0 1rem;
      font-size: 1.18rem;
      line-height: 1.65;
      min-height: 7.5rem;
    }

    .vendor-pricing-page__toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      width: fit-content;
      padding: 0.35rem;
      margin-bottom: 1.15rem;
      border-radius: 999px;
      background: rgba(var(--vp-fg-rgb), 0.06);
      border: 1px solid rgba(var(--vp-fg-rgb), 0.08);
    }

    .vendor-pricing-page__toggle button {
      min-width: 6rem;
      min-height: 2.45rem;
      padding: 0 1rem;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--vp-muted);
      font: inherit;
      font-size: 0.92rem;
      font-weight: 700;
      cursor: pointer;
    }

    .vendor-pricing-page__toggle button.is-active {
      color: #ffffff;
      background: linear-gradient(135deg, var(--vp-accent-strong), var(--vp-accent));
      box-shadow: 0 8px 20px rgba(63, 114, 255, 0.3);
    }

    .vendor-pricing-page__price-panel {
      display: none;
    }

    .vendor-pricing-page__price-panel.is-active {
      display: block;
    }

    .vendor-pricing-page__price-row {
      display: flex;
      align-items: baseline;
      gap: 0.4rem;
      margin-bottom: 1rem;
    }

    .vendor-pricing-page__main-price {
      font-size: 2.4rem;
      font-weight: 700;
      line-height: 1;
      color: var(--vp-text);
    }

    .vendor-pricing-page__price-term {
      font-size: 1rem;
      color: var(--vp-muted);
    }

    .vendor-pricing-page__features {
      list-style: none;
      display: grid;
      gap: 0.9rem;
      padding: 0;
      margin: 0;
    }

    .vendor-pricing-page__features--collapsible {
      max-height: 20rem;
      overflow: hidden;
      transition: max-height 0.24s ease;
    }

    .vendor-pricing-page__features--expanded {
      max-height: 80rem;
    }

    .vendor-pricing-page__features li {
      position: relative;
      padding-left: 1.7rem;
      font-size: 1rem;
      line-height: 1.7;
      color: var(--vp-text);
    }

    .vendor-pricing-page__features li::before {
      content: "";
      position: absolute;
      top: 0.52rem;
      left: 0;
      width: 0.65rem;
      height: 0.65rem;
      border-radius: 999px;
      background: linear-gradient(135deg, var(--vp-accent-strong), var(--vp-accent));
    }

    .vendor-pricing-page__features li strong {
      display: block;
      margin-bottom: 0.2rem;
      font-weight: 700;
      color: var(--vp-text);
    }

    .vendor-pricing-page__features li span {
      display: block;
    }

    .vendor-pricing-page__more {
      margin-top: 1rem;
      padding: 0;
      border: 0;
      background: transparent;
      color: #9db8ff;
      font: inherit;
      font-size: 0.96rem;
      font-weight: 700;
      cursor: pointer;
      text-align: left;
    }

    .vendor-pricing-page__cta {
      margin-top: auto;
      padding-top: 1.25rem;
    }

    .vendor-pricing-page__cta .vendor-pricing-page__button {
      width: 100%;
    }

    .vendor-pricing-page__policy-card {
      padding: 1.35rem;
      border-radius: 1.1rem;
    }

    .vendor-pricing-page__policy-card strong {
      display: block;
      margin-bottom: 0.45rem;
      font-size: 1.05rem;
    }

    .vendor-pricing-page__policy-card p {
      margin: 0;
      font-size: 0.98rem;
      line-height: 1.65;
    }

    @media screen and (max-width: 1100px) {
      .vendor-pricing-page__hero,
      .vendor-pricing-page__policy-grid {
        grid-template-columns: 1fr 1fr;
      }

      .vendor-pricing-page__grid {
        grid-template-columns: 1fr;
      }
    }

    @media screen and (max-width: 749px) {
      .page-width.page-width--narrow.section-template--21833919725807__main-padding {
        padding-left: 1.25rem !important;
        padding-right: 1.25rem !important;
      }

      .vendor-pricing-page {
        padding: 1rem 0 3rem;
      }

      .vendor-pricing-page__hero,
      .vendor-pricing-page__policy-grid {
        grid-template-columns: 1fr;
      }

      .vendor-pricing-page__hero-side {
        order: -1;
      }

      .vendor-pricing-page__grid {
        grid-template-columns: 1fr;
      }

      .vendor-pricing-page__hero h1 {
        font-size: clamp(2.5rem, 11vw, 3.4rem);
      }

      .vendor-pricing-page__plan-copy {
        min-height: auto;
      }

      .vendor-pricing-page__hero-actions {
        flex-direction: column;
      }

      .vendor-pricing-page__button {
        width: 100%;
      }

      .vendor-pricing-page__section-head {
        flex-direction: column;
        align-items: start;
      }

      .vendor-pricing-page__proofs {
        grid-template-columns: 1fr;
      }

      .vendor-pricing-page__founder-points {
        grid-template-columns: 1fr;
      }

      .vendor-pricing-page__offer-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>

  <div class="vendor-pricing-page" data-page-id="${VENDOR_PAGE_ID}">
    <div class="vendor-pricing-page__shell">
      <section class="vendor-pricing-page__hero">
        <div class="vendor-pricing-page__hero-main">
          <span class="vendor-pricing-page__eyebrow">
            <span class="vendor-pricing-page__eyebrow-dot"></span>
            Vendor Plans
          </span>
          <h1>Choose the vendor plan that fits your marketplace growth.</h1>
          <p>
            Publish with the right mix of visibility, trust signals, and analytics so buyers can evaluate your products with more confidence and less friction.
          </p>

          <div class="vendor-pricing-page__hero-actions">
            <a
              class="vendor-pricing-page__button vendor-pricing-page__button--primary"
              href="${VENDOR_PORTAL_URL}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Join as Vendor
            </a>
            <a
              class="vendor-pricing-page__button vendor-pricing-page__button--secondary"
              href="${VENDOR_PORTAL_URL}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Sign In
            </a>
          </div>

          <div class="vendor-pricing-page__proofs">
            <div class="vendor-pricing-page__proof">
              <span class="vendor-pricing-page__proof-label">Built For Conversion</span>
              <strong>Premium vendor presence</strong>
              <span>Position your products with stronger visibility, clearer proof points, and a more polished buyer experience.</span>
            </div>
            <div class="vendor-pricing-page__proof">
              <span class="vendor-pricing-page__proof-label">Trust Signals</span>
              <strong>Earn buyer confidence faster</strong>
              <span>Verification, branded presentation, and stronger support positioning help reduce hesitation during evaluation.</span>
            </div>
            <div class="vendor-pricing-page__proof">
              <span class="vendor-pricing-page__proof-label">Growth Ready</span>
              <strong>Scale your marketplace reach</strong>
              <span>Unlock richer placement, analytics, and visibility upgrades as your product portfolio and demand grow.</span>
            </div>
          </div>
        </div>

        <aside class="vendor-pricing-page__hero-side">
          <div class="vendor-pricing-page__hero-carousel" data-hero-carousel>
            <div class="vendor-pricing-page__hero-track-wrap">
              <div class="vendor-pricing-page__hero-track" style="--active-slide: 0;">
                <section class="vendor-pricing-page__hero-slide vendor-pricing-page__hero-slide--founder" aria-label="Founder Vendor Program offer">
                  <div class="vendor-pricing-page__founder-content">
                    <span class="vendor-pricing-page__founder-badge">Founder Vendor Program</span>
                    <div>
                      <h2 class="vendor-pricing-page__founder-title">Lock Your Founder Pricing for 3 Years</h2>
                      <p class="vendor-pricing-page__founder-copy">
                        Join early and secure significantly lower launch pricing before future pricing increases.
                      </p>
                    </div>
                    <ul class="vendor-pricing-page__founder-points">
                      <li><strong>Significantly lower founder pricing</strong></li>
                      <li><strong>Pricing locked for 3 years</strong></li>
                      <li><strong>Priority visibility</strong></li>
                      <li><strong>Founder badge</strong></li>
                      <li><strong>Limited founder slots</strong></li>
                      <li><strong>Early partner advantage</strong></li>
                      <li><strong>Secure spots on sponsored places</strong></li>
                    </ul>
                    <div class="vendor-pricing-page__founder-actions">
                      <a
                        class="vendor-pricing-page__button vendor-pricing-page__button--primary"
                        href="${VENDOR_PORTAL_URL}"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Secure Founder Access
                      </a>
                    </div>
                  </div>
                </section>

                <section class="vendor-pricing-page__hero-slide vendor-pricing-page__hero-slide--visibility" aria-label="Vendor visibility offer">
                  <div class="vendor-pricing-page__founder-content">
                    <span class="vendor-pricing-page__offer-badge">Vendor Growth Offer</span>
                    <div>
                      <h2 class="vendor-pricing-page__offer-title">Reach Buyers Already Comparing Solutions</h2>
                      <p class="vendor-pricing-page__offer-copy">
                        Launch into an audience actively exploring software, SaaS, AI tools, hosting, and digital products with stronger buyer intent.
                      </p>
                    </div>
                    <ul class="vendor-pricing-page__offer-grid">
                      <li>
                        <div>
                          <strong>Discovery surfaces</strong>
                          <span>Show up in product listings, category pages, and comparison journeys.</span>
                        </div>
                      </li>
                      <li>
                        <div>
                          <strong>Qualified buyer traffic</strong>
                          <span>Reach decision-makers already researching and shortlisting solutions.</span>
                        </div>
                      </li>
                      <li>
                        <div>
                          <strong>Premium presence</strong>
                          <span>Present your product with a sharper storefront, proof signals, and stronger positioning.</span>
                        </div>
                      </li>
                      <li>
                        <div>
                          <strong>Growth-ready exposure</strong>
                          <span>Build visibility earlier while the marketplace is still opening up.</span>
                        </div>
                      </li>
                    </ul>
                    <div class="vendor-pricing-page__offer-actions">
                      <a
                        class="vendor-pricing-page__button vendor-pricing-page__button--primary"
                        href="${VENDOR_PORTAL_URL}"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Start Vendor Application
                      </a>
                    </div>
                  </div>
                </section>

                <section class="vendor-pricing-page__hero-slide vendor-pricing-page__hero-slide--advantage" aria-label="Founder advantage offer">
                  <div class="vendor-pricing-page__founder-content">
                    <span class="vendor-pricing-page__offer-badge">Early Partner Advantage</span>
                    <div>
                      <h2 class="vendor-pricing-page__offer-title">Launch With More Visibility Before Competition Builds</h2>
                      <p class="vendor-pricing-page__offer-copy">
                        Early vendors can establish brand presence, trust, and marketplace authority before later entrants compete for the same attention.
                      </p>
                    </div>
                    <div class="vendor-pricing-page__offer-kicker">
                      <strong>Founder benefits stay commercially focused</strong>
                      <span class="vendor-pricing-page__offer-metric">3-Year Price Lock</span>
                    </div>
                    <ul class="vendor-pricing-page__offer-grid">
                      <li>
                        <div>
                          <strong>Founder badge</strong>
                          <span>Stand out as an early vendor with stronger launch-phase recognition.</span>
                        </div>
                      </li>
                      <li>
                        <div>
                          <strong>Priority visibility</strong>
                          <span>Improve your odds of being noticed while the vendor ecosystem is still taking shape.</span>
                        </div>
                      </li>
                      <li>
                        <div>
                          <strong>Preferred launch pricing</strong>
                          <span>Secure lower early pricing before future pricing rises with marketplace maturity.</span>
                        </div>
                      </li>
                      <li>
                        <div>
                          <strong>Limited slots</strong>
                          <span>Founder access is designed for a smaller group of early growth partners.</span>
                        </div>
                      </li>
                    </ul>
                    <div class="vendor-pricing-page__offer-actions">
                      <a
                        class="vendor-pricing-page__button vendor-pricing-page__button--primary"
                        href="${VENDOR_PORTAL_URL}"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Claim Early Vendor Slot
                      </a>
                    </div>
                    <div class="vendor-pricing-page__offer-note">
                      Early vendors gain stronger launch positioning, long-term price protection, and a clearer path to early marketplace momentum.
                    </div>
                  </div>
                </section>

                <section class="vendor-pricing-page__hero-slide vendor-pricing-page__hero-slide--visibility" aria-label="Paid plan value summary">
                  <div class="vendor-pricing-page__founder-content">
                    <span class="vendor-pricing-page__offer-badge">Paid Plan Benefits</span>
                    <div>
                      <h2 class="vendor-pricing-page__offer-title">Stronger Visibility, Trust Signals, and Decision Support</h2>
                      <p class="vendor-pricing-page__offer-copy">
                        Move from a basic listing toward richer placement, higher buyer confidence, and better insight into how your products perform across ITMart24.
                      </p>
                    </div>

                    <ul class="vendor-pricing-page__offer-grid">
                      <li>
                        <div>
                          <strong>Trust and verification</strong>
                          <span>Highlight verified ownership, support expectations, refund clarity, and other signals that reduce buyer hesitation.</span>
                        </div>
                      </li>
                      <li>
                        <div>
                          <strong>Better placement</strong>
                          <span>Unlock stronger comparison visibility, premium impressions, featured opportunities, and broader discovery surfaces.</span>
                        </div>
                      </li>
                      <li>
                        <div>
                          <strong>Performance insight</strong>
                          <span>Track profile interest, product engagement, and higher-value lead signals as your visibility grows.</span>
                        </div>
                      </li>
                      <li>
                        <div>
                          <strong>Upgrade with intent</strong>
                          <span>Choose paid visibility layers when you are ready to amplify discovery and buyer confidence.</span>
                        </div>
                      </li>
                    </ul>
                  </div>
                </section>
              </div>
            </div>

            <div class="vendor-pricing-page__hero-dots" aria-label="Hero panel slides">
              <button
                type="button"
                class="vendor-pricing-page__hero-dot is-active"
                aria-label="Show founder offer slide"
                aria-pressed="true"
                data-hero-slide-dot="0"
              ></button>
              <button
                type="button"
                class="vendor-pricing-page__hero-dot"
                aria-label="Show vendor visibility slide"
                aria-pressed="false"
                data-hero-slide-dot="1"
              ></button>
              <button
                type="button"
                class="vendor-pricing-page__hero-dot"
                aria-label="Show founder advantage slide"
                aria-pressed="false"
                data-hero-slide-dot="2"
              ></button>
              <button
                type="button"
                class="vendor-pricing-page__hero-dot"
                aria-label="Show paid plan benefits slide"
                aria-pressed="false"
                data-hero-slide-dot="3"
              ></button>
            </div>
          </div>
        </aside>
      </section>

      <section class="vendor-pricing-page__plans">
        <div class="vendor-pricing-page__section-head">
          <div>
            <h2>Plans & Pricing</h2>
            <p>
              Pick the plan that matches your current growth stage and the level of visibility you want across ITMart24.
            </p>
          </div>
        </div>

        <div class="vendor-pricing-page__grid">
          ${plans.map(renderPlanCard).join("")}
        </div>
      </section>

      <section class="vendor-pricing-page__policy">
        <div class="vendor-pricing-page__section-head">
          <div>
            <h2>Which plan fits best?</h2>
            <p>
              A quick guide to choosing the plan depth that matches your current marketplace goals.
            </p>
          </div>
        </div>

        <div class="vendor-pricing-page__policy-grid">
          ${plans
    .map((plan) => `
                <div class="vendor-pricing-page__policy-card">
                  <strong>${escapeHtml(plan.name)} Plan</strong>
                  <p>${escapeHtml(plan.summary)}</p>
                </div>
              `)
    .join("")}
        </div>
      </section>
    </div>
  </div>

  <script>
    (function () {
      var root = document.querySelector('.vendor-pricing-page[data-page-id="${VENDOR_PAGE_ID}"]');

      if (!root) {
        return;
      }

      root.querySelectorAll('[data-collapsible-toggle]').forEach(function (button) {
        button.addEventListener('click', function () {
          var list = button.previousElementSibling;

          if (!list || !list.classList.contains('vendor-pricing-page__features')) {
            return;
          }

          var expanded = list.classList.toggle('vendor-pricing-page__features--expanded');
          button.textContent = expanded ? 'Hide features' : 'View all features';
        });
      });

      root.querySelectorAll('.vendor-pricing-page__toggle').forEach(function (toggle) {
        var targetId = toggle.getAttribute('data-toggle-for');
        var pricingBox = targetId ? root.querySelector('#' + targetId) : null;
        var buttons = toggle.querySelectorAll('[data-mode-btn]');

        if (!pricingBox || !buttons.length) {
          return;
        }

        buttons.forEach(function (button) {
          button.addEventListener('click', function () {
            var mode = button.getAttribute('data-mode-btn');

            if (!mode) {
              return;
            }

            buttons.forEach(function (candidate) {
              candidate.classList.toggle('is-active', candidate === button);
            });

            pricingBox.querySelectorAll('[data-price-mode]').forEach(function (panel) {
              panel.classList.toggle('is-active', panel.getAttribute('data-price-mode') === mode);
            });
          });
        });
      });

      (function initHeroCarousel() {
        var carousel = root.querySelector('[data-hero-carousel]');
        var track = carousel ? carousel.querySelector('.vendor-pricing-page__hero-track') : null;
        var trackWrap = carousel ? carousel.querySelector('.vendor-pricing-page__hero-track-wrap') : null;
        var dots = carousel ? carousel.querySelectorAll('[data-hero-slide-dot]') : [];
        var slideCount = dots.length;
        var activeIndex = 0;
        var timerId = null;
        var isPaused = false;
        var pointerStartX = 0;
        var pointerStartY = 0;
        var pointerDeltaX = 0;
        var pointerId = null;
        var isDragging = false;
        var dragThreshold = 48;

        if (!carousel || !track || !trackWrap || slideCount < 2) {
          return;
        }

        function renderSlide(index) {
          activeIndex = index;
          track.style.setProperty('--active-slide', String(index));

          dots.forEach(function (dot, dotIndex) {
            var isActive = dotIndex === index;
            dot.classList.toggle('is-active', isActive);
            dot.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
        }

        function goToNextSlide() {
          renderSlide((activeIndex + 1) % slideCount);
        }

        function goToPreviousSlide() {
          renderSlide((activeIndex - 1 + slideCount) % slideCount);
        }

        function stopAutoPlay() {
          if (timerId) {
            window.clearInterval(timerId);
            timerId = null;
          }
        }

        function startAutoPlay() {
          stopAutoPlay();

          if (isPaused) {
            return;
          }

          timerId = window.setInterval(function () {
            goToNextSlide();
          }, 5000);
        }

        function resetDragState() {
          pointerId = null;
          pointerDeltaX = 0;
          isDragging = false;
          track.style.removeProperty('cursor');
        }

        function handlePointerStart(event) {
          if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
          }

          pointerId = event.pointerId;
          pointerStartX = event.clientX;
          pointerStartY = event.clientY;
          pointerDeltaX = 0;
          isDragging = true;
          isPaused = true;
          stopAutoPlay();
          track.style.cursor = 'grabbing';
          track.setPointerCapture(event.pointerId);
        }

        function handlePointerMove(event) {
          var deltaY;

          if (!isDragging || pointerId !== event.pointerId) {
            return;
          }

          pointerDeltaX = event.clientX - pointerStartX;
          deltaY = Math.abs(event.clientY - pointerStartY);

          if (Math.abs(pointerDeltaX) > deltaY) {
            event.preventDefault();
          }
        }

        function handlePointerEnd(event) {
          if (!isDragging || pointerId !== event.pointerId) {
            return;
          }

          if (track.hasPointerCapture(event.pointerId)) {
            track.releasePointerCapture(event.pointerId);
          }

          if (pointerDeltaX <= -dragThreshold) {
            goToNextSlide();
          } else if (pointerDeltaX >= dragThreshold) {
            goToPreviousSlide();
          }

          isPaused = false;
          resetDragState();
          startAutoPlay();
        }

        dots.forEach(function (dot, dotIndex) {
          dot.addEventListener('click', function () {
            renderSlide(dotIndex);
            startAutoPlay();
          });
        });

        carousel.addEventListener('mouseenter', function () {
          isPaused = true;
          stopAutoPlay();
        });

        carousel.addEventListener('mouseleave', function () {
          isPaused = false;
          startAutoPlay();
        });

        carousel.addEventListener('focusin', function () {
          isPaused = true;
          stopAutoPlay();
        });

        carousel.addEventListener('focusout', function (event) {
          if (carousel.contains(event.relatedTarget)) {
            return;
          }

          isPaused = false;
          startAutoPlay();
        });

        track.addEventListener('pointerdown', handlePointerStart);
        track.addEventListener('pointermove', handlePointerMove);
        track.addEventListener('pointerup', handlePointerEnd);
        track.addEventListener('pointercancel', handlePointerEnd);
        track.addEventListener('lostpointercapture', function () {
          if (!isDragging) {
            return;
          }

          isPaused = false;
          resetDragState();
          startAutoPlay();
        });

        renderSlide(0);
        startAutoPlay();
      })();
    })();
  </script>
`.trim();
const loadVendorPageSpec = async () => {
    const snapshot = await firebaseAdmin_1.firestore
        .collection("subscription_plans")
        .get();
    const plans = snapshot.docs
        .map((doc, index) => normalizeVendorPagePlan({
        id: doc.id,
        ...doc.data(),
    }, index))
        .filter((plan) => Boolean(plan))
        .sort((left, right) => left.sortOrder - right.sortOrder);
    if (plans.length === 0) {
        throw new Error("No active subscription plans found for vendor page.");
    }
    return {
        legacyId: VENDOR_PAGE_ID,
        title: "Vendor",
        handle: "vendor",
        bodyHtml: buildVendorPageHtml(plans),
    };
};
const loadPageSpecs = async () => [
    ...STATIC_PAGE_SPECS,
    await loadVendorPageSpec(),
];
const MENU_ITEM_FIELDS = `
  id
  title
  type
  url
  resourceId
  tags
  items {
    id
    title
    type
    url
    resourceId
    tags
    items {
      id
      title
      type
      url
      resourceId
      tags
      items {
        id
        title
        type
        url
        resourceId
        tags
      }
    }
  }
`;
const STATIC_PAGE_SPECS = [
    {
        legacyId: "131222503663",
        title: "Terms & Conditions",
        handle: "terms-and-conditions",
        menuHandle: "footer-legal",
        menuTitles: ["Terms & Conditions"],
        bodyHtml: `
      <h2>Acceptance of Terms</h2>
      <p>By accessing or using ITMart24, you agree to these Terms &amp; Conditions and all applicable laws. If you do not agree, please discontinue use of the platform.</p>
      <h2>Marketplace Role</h2>
      <p>ITMart24 operates as a digital technology marketplace that helps buyers discover, compare, and connect with software, cloud, hosting, AI, security, and related service providers.</p>
      <h2>Accounts and Listings</h2>
      <p>Users must provide accurate information and maintain account security. Vendors are responsible for truthful listings, commercial clarity, lawful rights, and support commitments associated with their products or services.</p>
      <h2>Acceptable Use</h2>
      <p>You may not misuse the platform for fraud, manipulation, intellectual property infringement, harmful content, or any attempt to interfere with platform operations or trust systems.</p>
      <h2>Intellectual Property and Liability</h2>
      <p>ITMart24 retains rights in its platform, branding, and original materials. Vendors and users retain rights in their lawful content, while granting ITMart24 a limited operational right to host and display such content. The platform is provided on an "as is" and "as available" basis to the fullest extent permitted by law.</p>
      <h2>Updates and Contact</h2>
      <p>We may update these terms periodically to reflect legal, operational, or marketplace changes. Questions should be directed through the Contact Us or support channels available on the website.</p>
    `.trim(),
    },
    {
        legacyId: "131222601967",
        title: "Refund Policy",
        handle: "refund-policy",
        menuHandle: "footer-legal",
        menuTitles: ["Refund Policy"],
        bodyHtml: `
      <h2>General Refund Approach</h2>
      <p>Because many ITMart24 offerings are digital, subscription-based, or service-driven, refunds are reviewed case by case rather than granted automatically.</p>
      <h2>When Refunds May Be Considered</h2>
      <p>Refunds may be considered if a product or service was not delivered as promised, if a duplicate charge occurred, or if a material mismatch exists between the listing and the delivered offer.</p>
      <h2>Common Non-Refundable Cases</h2>
      <p>Requests based on change of mind, completed onboarding or setup work, already delivered digital credentials, or unsupported expectations that were not represented in the listing are generally non-refundable.</p>
      <h2>Review Process</h2>
      <p>Buyers should submit refund requests promptly with relevant evidence such as order details, screenshots, error messages, and delivery information. ITMart24 may request information from both the buyer and the vendor before deciding on the appropriate resolution.</p>
    `.trim(),
    },
    {
        legacyId: "131222536431",
        title: "Privacy Policy",
        handle: "privacy-policy",
        menuHandle: "footer-legal",
        menuTitles: ["Privacy Policy"],
        bodyHtml: `
      <h2>Information We Collect</h2>
      <p>ITMart24 may collect account, inquiry, transaction, technical, and communication data needed to operate the marketplace and support users and vendors.</p>
      <h2>How We Use Information</h2>
      <p>Personal data may be used for account management, transactions, support, fraud prevention, analytics, marketing communications where permitted, and improvement of marketplace services.</p>
      <h2>Sharing and Disclosure</h2>
      <p>Information may be shared with vendors, service providers, payment partners, analytics systems, or legal authorities where required for marketplace operations, support, compliance, or safety.</p>
      <h2>Retention, Security, and User Rights</h2>
      <p>We retain information only as long as reasonably necessary for legal, operational, and security purposes. Users may request access, correction, deletion, or marketing preference changes subject to applicable legal and operational limits.</p>
    `.trim(),
    },
    {
        legacyId: "131222569199",
        title: "Cookie Policy",
        handle: "cookie-policy",
        menuHandle: "footer-legal",
        menuTitles: ["Cookie Policy"],
        bodyHtml: `
      <h2>What Cookies Are</h2>
      <p>Cookies and related technologies help websites remember preferences, maintain sessions, improve performance, and measure engagement.</p>
      <h2>How ITMart24 Uses Cookies</h2>
      <p>We may use essential, analytics, preference, and marketing-related cookies to support platform functionality, insights, personalization, and campaign measurement where permitted.</p>
      <h2>Third-Party Technologies</h2>
      <p>Some technologies may be set or accessed by third-party providers such as analytics tools, payment systems, or embedded services.</p>
      <h2>Managing Preferences</h2>
      <p>Users can manage cookies through browser settings and consent tools where available, though disabling some cookies may affect site functionality.</p>
    `.trim(),
    },
    {
        legacyId: "131213000943",
        title: "Vendor Agreement",
        handle: "vendor-agreement",
        menuHandle: "footer-vendors",
        menuTitles: ["Vendor Agreement"],
        bodyHtml: `
      <h2>Vendor Eligibility</h2>
      <p>Vendors must provide accurate business information and hold the lawful rights needed to market, resell, or represent the products and services they publish on ITMart24.</p>
      <h2>Listing Responsibilities</h2>
      <p>All vendor listings must remain truthful, current, commercially clear, and aligned with marketplace policies including Listing Guidelines, Anti-Fraud Policy, and Prohibited Products &amp; Services rules.</p>
      <h2>Pricing, Fulfillment, and Support</h2>
      <p>Vendors remain responsible for pricing accuracy, delivery, licensing, support, and buyer communications unless otherwise clearly stated by ITMart24.</p>
      <h2>Platform Rights and Enforcement</h2>
      <p>ITMart24 may review, limit, suspend, or remove vendor listings or accounts where policy violations, fraud signals, quality issues, or legal risks are detected.</p>
    `.trim(),
    },
    {
        legacyId: "131050733807",
        title: "About Us",
        handle: "about-us",
        menuHandle: "footer-company",
        menuTitles: ["About Us"],
        bodyHtml: `
      <h2>Who We Are</h2>
      <p>ITMart24 is a digital technology marketplace focused on helping businesses discover, compare, and evaluate software, cloud, hosting, AI, security, and related solutions.</p>
      <h2>What We Do</h2>
      <p>We structure technology categories, product visibility, vendor pages, and policy frameworks so buyers can research more efficiently and vendors can present their offerings more clearly.</p>
      <h2>How We Build Trust</h2>
      <p>Trust comes from stronger marketplace standards, better internal linking, transparent policy pages, and a clearer path from discovery to evaluation.</p>
      <h2>Our Direction</h2>
      <p>We aim to keep improving marketplace navigation, listing quality, trust and safety systems, and digital technology discovery experiences for both buyers and vendors.</p>
    `.trim(),
    },
    {
        legacyId: "131067642095",
        title: "How the Marketplace Works",
        handle: "how-the-marketplace-works",
        menuHandle: "footer-company",
        menuTitles: ["How It Works", "How the Marketplace Works"],
        bodyHtml: `
      <h2>Discover Solutions</h2>
      <p>Buyers can start with the category that best matches their business need and explore relevant software, services, hosting, AI, and cloud solutions.</p>
      <h2>Compare and Evaluate</h2>
      <p>ITMart24 is designed to make evaluation easier through structured listing content, clearer category pathways, and supporting trust and policy information.</p>
      <h2>Connect or Purchase</h2>
      <p>Depending on the listing, buyers may contact a vendor, request a demo, sign up, or complete a purchase once they identify the right fit.</p>
      <h2>Vendor Participation</h2>
      <p>Vendors participate by following onboarding requirements, maintaining accurate listings, and meeting marketplace standards that support buyer trust.</p>
    `.trim(),
    },
    {
        title: "How to List a Product",
        handle: "how-to-list-a-product",
        menuHandle: "footer-vendors",
        menuTitles: ["How to List a Product"],
        bodyHtml: `
      <h2>Eligibility Criteria</h2>
      <ul>
        <li>You should represent a legitimate business, product owner, reseller, or authorized service provider in a supported digital technology category.</li>
        <li>Your offering should be lawful, commercially clear, and suitable for a marketplace focused on software, cloud, hosting, AI, security, or related services.</li>
      </ul>
      <h2>Required Details Before Listing</h2>
      <ul>
        <li>Prepare your business identity details, website, contact information, and basic background.</li>
        <li>Prepare product details such as category fit, summary, pricing approach, delivery model, and support information.</li>
      </ul>
      <h2>High-Level Overview</h2>
      <ul>
        <li>Apply for or create a vendor account using the approved onboarding path.</li>
        <li>Complete required business information and prepare listing-ready content for review.</li>
        <li>Submit your information for verification before publication or wider visibility.</li>
      </ul>
      <h2>After Login</h2>
      <p>This page is only a pre-registration guide. The detailed listing guide and dashboard instructions are available after vendor login.</p>
    `.trim(),
    },
    {
        title: "Vendor FAQs",
        handle: "vendor-faqs",
        menuHandle: "footer-vendors",
        menuTitles: ["Vendor FAQs"],
        bodyHtml: `
      <h2>What Is ITMart24?</h2>
      <p>ITMart24 is a digital technology marketplace that helps buyers discover, compare, and evaluate software, hosting, cloud, AI, security, and related offerings.</p>
      <h2>Who Can Become a Vendor?</h2>
      <ul>
        <li>Businesses, product owners, authorized resellers, and qualified digital service providers may apply.</li>
        <li>Applicants should be ready to provide accurate business and product information for review.</li>
      </ul>
      <h2>Is Listing Free?</h2>
      <ul>
        <li>Listing availability or pricing may vary by plan, product type, or marketplace requirements.</li>
        <li>Affiliate links may be supported in some cases, but they are not mandatory for every listing.</li>
      </ul>
      <h2>What Products Are Allowed?</h2>
      <p>Allowed listings generally include legitimate digital technology products and services that fit marketplace policies and category standards.</p>
      <h2>Verification and Visibility</h2>
      <p>Verification may include review of business details, website quality, listing accuracy, and policy compliance. Visibility may depend on category fit, completeness, and overall listing quality.</p>
      <h2>More Help</h2>
      <p>Advanced FAQs and account-specific guidance are available inside the vendor dashboard after login.</p>
    `.trim(),
    },
    {
        title: "Why Choose Us",
        handle: "why-choose-us",
        menuHandle: "footer-company",
        menuTitles: ["Why Choose Us"],
        bodyHtml: `
      <h2>Built for Digital Technology</h2>
      <p>ITMart24 is intentionally structured around digital technology categories, helping buyers and vendors operate in a more relevant, comparison-friendly marketplace.</p>
      <h2>Better Buyer Journeys</h2>
      <p>We focus on discovery, evaluation, and trust so buyers can move from category research to a short list with less friction.</p>
      <h2>Better Vendor Visibility</h2>
      <p>Vendors benefit from structured category placement, clearer product presentation, and a marketplace environment that rewards quality and transparency.</p>
      <h2>Trust and Governance</h2>
      <p>Policies, review standards, and anti-fraud controls help create a stronger environment for both growth and confidence.</p>
    `.trim(),
    },
    {
        title: "Listing Guidelines",
        handle: "listing-guidelines",
        menuHandle: "footer-marketplace",
        menuTitles: ["Listing Guidelines"],
        bodyHtml: `
      <h2>Eligible Listings</h2>
      <p>Listings should represent legitimate digital technology products or services that fit supported marketplace categories and comply with applicable law and policy.</p>
      <h2>Accuracy and Clarity</h2>
      <p>Descriptions, screenshots, use cases, pricing, and feature claims must remain accurate, supportable, and easy for buyers to understand.</p>
      <h2>Pricing and Disclosures</h2>
      <p>Vendors should clearly disclose core commercial terms such as renewals, setup fees, usage limits, or onboarding dependencies where relevant.</p>
      <h2>Enforcement</h2>
      <p>ITMart24 may request corrections, limit visibility, reject content, or remove listings that do not meet marketplace quality standards.</p>
    `.trim(),
    },
    {
        title: "Review & Rating Policy",
        handle: "review-rating-policy",
        menuHandle: "footer-marketplace",
        menuTitles: ["Review Policy", "Review & Rating Policy"],
        bodyHtml: `
      <h2>Purpose of Reviews</h2>
      <p>Reviews and ratings should help buyers make more informed decisions by reflecting genuine product, service, or vendor experiences.</p>
      <h2>Integrity Standards</h2>
      <p>Fake, purchased, coordinated, retaliatory, or otherwise manipulated reviews are not permitted on ITMart24.</p>
      <h2>Moderation</h2>
      <p>ITMart24 may moderate, suppress, or remove review content that is abusive, irrelevant, misleading, or inconsistent with platform standards.</p>
      <h2>Vendor Responses</h2>
      <p>Where response tools are provided, vendors should remain factual, professional, and non-threatening in all communications.</p>
    `.trim(),
    },
    {
        title: "Prohibited Products & Services",
        handle: "prohibited-products-services",
        menuHandle: "footer-marketplace",
        menuTitles: ["Prohibited Products", "Prohibited Products & Services"],
        bodyHtml: `
      <h2>Illegal or Harmful Offerings</h2>
      <p>Products or services that are unlawful, malicious, exploitative, or intended to cause harm are not allowed on ITMart24.</p>
      <h2>Deceptive or Fraudulent Services</h2>
      <p>Listings that rely on impersonation, fabricated outcomes, false compliance claims, or deceptive commercial behavior are prohibited.</p>
      <h2>IP and Brand Misuse</h2>
      <p>Unauthorized use of copyrighted, trademarked, or otherwise protected content is not permitted.</p>
      <h2>Enforcement</h2>
      <p>ITMart24 may remove listings or restrict accounts immediately where significant safety, fraud, or legal risks are identified.</p>
    `.trim(),
    },
    {
        title: "Anti-Fraud Policy",
        handle: "anti-fraud-policy",
        menuHandle: "footer-marketplace",
        menuTitles: ["Anti-Fraud Policy"],
        bodyHtml: `
      <h2>Fraud Prevention Goals</h2>
      <p>ITMart24 works to protect buyers, vendors, and platform systems by monitoring for suspicious commercial, behavioral, and technical signals.</p>
      <h2>Signals We Review</h2>
      <p>We may review unusual account patterns, misleading listings, payment anomalies, repeat abuse, review manipulation, or other indicators of fraud risk.</p>
      <h2>User Obligations</h2>
      <p>Buyers and vendors must provide accurate information, cooperate with reasonable verification, and avoid any attempt to manipulate transactions or marketplace trust systems.</p>
      <h2>Actions We May Take</h2>
      <p>ITMart24 may request verification, limit activity, suspend access, or escalate issues for further review when fraud concerns arise.</p>
    `.trim(),
    },
    {
        title: "Help Center",
        handle: "help-center",
        menuHandle: "footer-support",
        menuTitles: ["Help Center"],
        bodyHtml: `
      <h2>How to Search Products</h2>
      <ul>
        <li>Use category navigation, search, and marketplace filters to find relevant products or services.</li>
        <li>Compare listings carefully before deciding which vendor or solution fits your needs.</li>
      </ul>
      <h2>Understanding Listings</h2>
      <p>Listings may include product summaries, screenshots, pricing clues, vendor information, and policy-related disclosures. Buyers should review listing details carefully before taking action.</p>
      <h2>Platform Role</h2>
      <p>ITMart24 primarily acts as a marketplace and discovery platform and is not usually the direct seller of third-party vendor offerings.</p>
      <h2>Buying Flow</h2>
      <p>Depending on the listing, users may be redirected to the vendor website, contact the vendor, request a demo, or follow a product-specific action path.</p>
      <h2>Vendor Help</h2>
      <p>Vendor-specific help is available inside the vendor login area and is not covered by this public Help Center page.</p>
    `.trim(),
    },
    {
        title: "Contact Support",
        handle: "contact-support",
        menuHandle: "footer-support",
        menuTitles: ["Contact Support", "Contact / Support Ticket"],
        bodyHtml: `
      <h2>When to Contact Support</h2>
      <ul>
        <li>General inquiries about the website or marketplace experience.</li>
        <li>Technical issues, listing errors, or storefront problems.</li>
        <li>Pre-sales or pre-registration vendor questions.</li>
      </ul>
      <h2>Required Ticket Details</h2>
      <ul>
        <li>Name and email address.</li>
        <li>Issue description or question.</li>
        <li>Affected URL where relevant.</li>
        <li>Screenshots or supporting evidence where available.</li>
      </ul>
      <h2>Support Guidance</h2>
      <p>If the issue relates to abuse or security, please use the dedicated reporting pages. Approved vendors should use dashboard support after login for account-specific requests.</p>
    `.trim(),
    },
    {
        title: "Report Abuse",
        handle: "report-abuse",
        menuHandle: "footer-support",
        menuTitles: ["Report Abuse"],
        bodyHtml: `
      <h2>Vendor Profile Abuse</h2>
      <p>If a Report Abuse button is available on a vendor profile or listing page, use that button first to report the specific issue.</p>
      <h2>General Abuse Reporting</h2>
      <p>If you do not have a button available, report the issue to abuse@itmart24.com and include the affected URL, issue summary, and supporting evidence.</p>
      <h2>Examples of Abuse</h2>
      <ul>
        <li>Fraud or deceptive listings.</li>
        <li>Spam or misleading content.</li>
        <li>Impersonation of a business, brand, or individual.</li>
      </ul>
      <h2>Required Report Details</h2>
      <ul>
        <li>The affected URL or page.</li>
        <li>A short explanation of the issue.</li>
        <li>Screenshots or other evidence where available.</li>
      </ul>
    `.trim(),
    },
    {
        title: "Report Security Issue",
        handle: "report-security-issue",
        menuHandle: "footer-support",
        menuTitles: ["Report Security Issue"],
        bodyHtml: `
      <h2>What to Report</h2>
      <ul>
        <li>Cross-site scripting, authentication issues, access control flaws, data leaks, or other reproducible security weaknesses.</li>
        <li>Other vulnerabilities that create a meaningful security risk for ITMart24 or its users.</li>
      </ul>
      <h2>What Not to Do</h2>
      <ul>
        <li>Do not exploit the issue beyond what is necessary to confirm it exists.</li>
        <li>Do not access, misuse, or disclose data that is not your own.</li>
      </ul>
      <h2>Required Report Details</h2>
      <ul>
        <li>Step-by-step reproduction details.</li>
        <li>The affected URL, page, or feature.</li>
        <li>Screenshots or other supporting evidence.</li>
      </ul>
      <h2>Security Email</h2>
      <p>Send responsible disclosure reports to security@itmart24.com.</p>
    `.trim(),
    },
];
const MENU_HANDLES = [
    "footer-company",
    "footer-vendors",
    "footer-marketplace",
    "footer-legal",
    "footer-support",
];
const normalizeText = (value) => value.trim().toLowerCase();
const getGraphQlErrorMessage = (errors, fallback = "Shopify request failed") => {
    if (!Array.isArray(errors) || errors.length === 0) {
        return fallback;
    }
    const joined = errors
        .map((error) => error.message?.trim())
        .filter(Boolean)
        .join(", ");
    return joined || fallback;
};
const formatUserErrors = (userErrors, fallback) => {
    const message = userErrors
        .map((error) => {
        const field = Array.isArray(error.field) && error.field.length > 0
            ? `${error.field.join(".")}: `
            : "";
        return `${field}${error.message ?? "Unknown error"}`;
    })
        .join("; ");
    return message || fallback;
};
const graphqlRequest = async (query, variables) => {
    const response = await shopifyHttp_1.shopifyGraphQL.post("", {
        query,
        variables,
    });
    if (response.data?.errors?.length) {
        throw new Error(getGraphQlErrorMessage(response.data.errors));
    }
    return response.data.data;
};
const loadExistingPages = async (pageSpecs) => {
    const handlesQuery = pageSpecs.map((page) => `handle:${page.handle}`)
        .join(" OR ");
    const data = await graphqlRequest(`
      query ExistingPages($first: Int!, $query: String!) {
        pages(first: $first, query: $query) {
          nodes {
            id
            title
            handle
          }
        }
      }
    `, {
        first: pageSpecs.length + 10,
        query: handlesQuery,
    });
    return new Map(data.pages.nodes.map((page) => [page.handle, page]));
};
const createPage = async (page) => {
    const data = await graphqlRequest(`
      mutation CreatePage($page: PageCreateInput!) {
        pageCreate(page: $page) {
          page {
            id
            title
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
        page: {
            title: page.title,
            handle: page.handle,
            body: page.bodyHtml,
            isPublished: true,
        },
    });
    if (data.pageCreate.userErrors.length > 0) {
        throw new Error(formatUserErrors(data.pageCreate.userErrors, `Unable to create page ${page.title}`));
    }
    if (!data.pageCreate.page) {
        throw new Error(`Page ${page.title} was not created.`);
    }
    return data.pageCreate.page;
};
const updatePage = async (pageId, page) => {
    const data = await graphqlRequest(`
      mutation UpdatePage($id: ID!, $page: PageUpdateInput!) {
        pageUpdate(id: $id, page: $page) {
          page {
            id
            title
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
        id: pageId,
        page: {
            title: page.title,
            handle: page.handle,
            body: page.bodyHtml,
            isPublished: true,
            redirectNewHandle: true,
        },
    });
    if (data.pageUpdate.userErrors.length > 0) {
        throw new Error(formatUserErrors(data.pageUpdate.userErrors, `Unable to update page ${page.title}`));
    }
    if (!data.pageUpdate.page) {
        throw new Error(`Page ${page.title} was not updated.`);
    }
    return data.pageUpdate.page;
};
const loadMenus = async () => {
    const queryValue = MENU_HANDLES.map((handle) => `handle:${handle}`)
        .join(" OR ");
    const data = await graphqlRequest(`
      query ExistingMenus($first: Int!, $query: String!) {
        menus(first: $first, query: $query) {
          nodes {
            id
            handle
            title
            items {
              ${MENU_ITEM_FIELDS}
            }
          }
        }
      }
    `, {
        first: MENU_HANDLES.length + 10,
        query: queryValue,
    });
    return data.menus.nodes;
};
const buildMenuItemInput = (item) => {
    const input = {
        id: item.id ?? undefined,
        title: item.title,
        type: item.type,
        items: (item.items ?? []).map(buildMenuItemInput),
    };
    if (item.url) {
        input.url = item.url;
    }
    if (item.resourceId) {
        input.resourceId = item.resourceId;
    }
    if (item.tags && item.tags.length > 0) {
        input.tags = item.tags;
    }
    return input;
};
const updateMenuItems = (items, menuHandle, pageLookup, pageSpecs) => {
    return items.map((item) => {
        const matchingSpec = pageSpecs.find((page) => {
            if (page.menuHandle !== menuHandle || !page.menuTitles) {
                return false;
            }
            return page.menuTitles
                .map(normalizeText)
                .includes(normalizeText(item.title));
        });
        const nestedItems = updateMenuItems(item.items ?? [], menuHandle, pageLookup, pageSpecs);
        if (!matchingSpec) {
            return {
                ...item,
                items: nestedItems,
            };
        }
        const linkedPage = pageLookup.get(matchingSpec.handle);
        if (!linkedPage) {
            return {
                ...item,
                items: nestedItems,
            };
        }
        return {
            ...item,
            type: "PAGE",
            resourceId: linkedPage.id,
            url: `/pages/${linkedPage.handle}`,
            items: nestedItems,
        };
    });
};
const saveMenu = async (menu, items) => {
    const data = await graphqlRequest(`
      mutation UpdateMenu(
        $id: ID!
        $title: String!
        $handle: String!
        $items: [MenuItemUpdateInput!]!
      ) {
        menuUpdate(
          id: $id
          title: $title
          handle: $handle
          items: $items
        ) {
          menu {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
        id: menu.id,
        title: menu.title,
        handle: menu.handle,
        items: items.map(buildMenuItemInput),
    });
    if (data.menuUpdate.userErrors.length > 0) {
        throw new Error(formatUserErrors(data.menuUpdate.userErrors, `Unable to update menu ${menu.handle}`));
    }
};
const main = async () => {
    const pageSpecs = await loadPageSpecs();
    console.log("Loading existing Shopify pages...");
    const existingPagesByHandle = await loadExistingPages(pageSpecs);
    const syncedPages = new Map();
    for (const spec of pageSpecs) {
        const existingId = spec.legacyId
            ? `gid://shopify/Page/${spec.legacyId}`
            : existingPagesByHandle.get(spec.handle)?.id;
        const page = existingId
            ? await updatePage(existingId, spec)
            : await createPage(spec);
        syncedPages.set(spec.handle, page);
        console.log(`${existingId ? "Updated" : "Created"} page: ${page.title} (${page.handle})`);
    }
    console.log("Loading Shopify menus...");
    const menus = await loadMenus();
    for (const menu of menus) {
        const nextItems = updateMenuItems(menu.items, menu.handle, syncedPages, pageSpecs);
        await saveMenu(menu, nextItems);
        console.log(`Updated menu links for ${menu.handle}`);
    }
    console.log("Done. Synced pages and menu links.");
};
main().catch((error) => {
    console.error("upsertShopifyContentPages failed");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});

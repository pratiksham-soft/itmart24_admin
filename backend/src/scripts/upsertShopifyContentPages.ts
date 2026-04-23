import "../config/env";
import { shopifyGraphQL } from "../services/shopifyHttp";

type GraphQlError = {
  message?: string;
};

type UserError = {
  field?: string[] | null;
  message?: string;
};

type PageSpec = {
  title: string;
  handle: string;
  bodyHtml: string;
  legacyId?: string;
  menuHandle?: string;
  menuTitles?: string[];
};

type PageRecord = {
  id: string;
  title: string;
  handle: string;
};

type MenuItemNode = {
  id?: string | null;
  title: string;
  type: string;
  url?: string | null;
  resourceId?: string | null;
  tags?: string[] | null;
  items?: MenuItemNode[] | null;
};

type MenuNode = {
  id: string;
  handle: string;
  title: string;
  items: MenuItemNode[];
};

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

const PAGE_SPECS: PageSpec[] = [
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

const normalizeText = (value: string) =>
  value.trim().toLowerCase();

const getGraphQlErrorMessage = (
  errors?: GraphQlError[] | null,
  fallback = "Shopify request failed"
) => {
  if (!Array.isArray(errors) || errors.length === 0) {
    return fallback;
  }

  const joined = errors
    .map((error) => error.message?.trim())
    .filter(Boolean)
    .join(", ");

  return joined || fallback;
};

const formatUserErrors = (
  userErrors: UserError[],
  fallback: string
) => {
  const message = userErrors
    .map((error) => {
      const field =
        Array.isArray(error.field) && error.field.length > 0
          ? `${error.field.join(".")}: `
          : "";
      return `${field}${error.message ?? "Unknown error"}`;
    })
    .join("; ");

  return message || fallback;
};

const graphqlRequest = async <TData>(
  query: string,
  variables?: Record<string, unknown>
): Promise<TData> => {
  const response = await shopifyGraphQL.post("", {
    query,
    variables,
  });

  if (response.data?.errors?.length) {
    throw new Error(
      getGraphQlErrorMessage(response.data.errors)
    );
  }

  return response.data.data as TData;
};

const loadExistingPages = async () => {
  const handlesQuery = PAGE_SPECS.map((page) => `handle:${page.handle}`)
    .join(" OR ");

  const data = await graphqlRequest<{
    pages: {
      nodes: PageRecord[];
    };
  }>(
    `
      query ExistingPages($first: Int!, $query: String!) {
        pages(first: $first, query: $query) {
          nodes {
            id
            title
            handle
          }
        }
      }
    `,
    {
      first: PAGE_SPECS.length + 10,
      query: handlesQuery,
    }
  );

  return new Map(
    data.pages.nodes.map((page) => [page.handle, page])
  );
};

const createPage = async (page: PageSpec) => {
  const data = await graphqlRequest<{
    pageCreate: {
      page: PageRecord | null;
      userErrors: UserError[];
    };
  }>(
    `
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
    `,
    {
      page: {
        title: page.title,
        handle: page.handle,
        body: page.bodyHtml,
        isPublished: true,
      },
    }
  );

  if (data.pageCreate.userErrors.length > 0) {
    throw new Error(
      formatUserErrors(
        data.pageCreate.userErrors,
        `Unable to create page ${page.title}`
      )
    );
  }

  if (!data.pageCreate.page) {
    throw new Error(`Page ${page.title} was not created.`);
  }

  return data.pageCreate.page;
};

const updatePage = async (
  pageId: string,
  page: PageSpec
) => {
  const data = await graphqlRequest<{
    pageUpdate: {
      page: PageRecord | null;
      userErrors: UserError[];
    };
  }>(
    `
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
    `,
    {
      id: pageId,
      page: {
        title: page.title,
        handle: page.handle,
        body: page.bodyHtml,
        isPublished: true,
        redirectNewHandle: true,
      },
    }
  );

  if (data.pageUpdate.userErrors.length > 0) {
    throw new Error(
      formatUserErrors(
        data.pageUpdate.userErrors,
        `Unable to update page ${page.title}`
      )
    );
  }

  if (!data.pageUpdate.page) {
    throw new Error(`Page ${page.title} was not updated.`);
  }

  return data.pageUpdate.page;
};

const loadMenus = async () => {
  const queryValue = MENU_HANDLES.map((handle) => `handle:${handle}`)
    .join(" OR ");

  const data = await graphqlRequest<{
    menus: {
      nodes: MenuNode[];
    };
  }>(
    `
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
    `,
    {
      first: MENU_HANDLES.length + 10,
      query: queryValue,
    }
  );

  return data.menus.nodes;
};

const buildMenuItemInput = (item: MenuItemNode): Record<string, unknown> => {
  const input: Record<string, unknown> = {
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

const updateMenuItems = (
  items: MenuItemNode[],
  menuHandle: string,
  pageLookup: Map<string, PageRecord>
): MenuItemNode[] => {
  return items.map((item) => {
    const matchingSpec = PAGE_SPECS.find((page) => {
      if (page.menuHandle !== menuHandle || !page.menuTitles) {
        return false;
      }

      return page.menuTitles
        .map(normalizeText)
        .includes(normalizeText(item.title));
    });

    const nestedItems: MenuItemNode[] = updateMenuItems(
      item.items ?? [],
      menuHandle,
      pageLookup
    );

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

const saveMenu = async (
  menu: MenuNode,
  items: MenuItemNode[]
) => {
  const data = await graphqlRequest<{
    menuUpdate: {
      menu: {
        id: string;
        handle: string;
      } | null;
      userErrors: UserError[];
    };
  }>(
    `
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
    `,
    {
      id: menu.id,
      title: menu.title,
      handle: menu.handle,
      items: items.map(buildMenuItemInput),
    }
  );

  if (data.menuUpdate.userErrors.length > 0) {
    throw new Error(
      formatUserErrors(
        data.menuUpdate.userErrors,
        `Unable to update menu ${menu.handle}`
      )
    );
  }
};

const main = async () => {
  console.log("Loading existing Shopify pages...");
  const existingPagesByHandle = await loadExistingPages();
  const syncedPages = new Map<string, PageRecord>();

  for (const spec of PAGE_SPECS) {
    const existingId = spec.legacyId
      ? `gid://shopify/Page/${spec.legacyId}`
      : existingPagesByHandle.get(spec.handle)?.id;

    const page = existingId
      ? await updatePage(existingId, spec)
      : await createPage(spec);

    syncedPages.set(spec.handle, page);
    console.log(
      `${existingId ? "Updated" : "Created"} page: ${page.title} (${page.handle})`
    );
  }

  console.log("Loading Shopify menus...");
  const menus = await loadMenus();

  for (const menu of menus) {
    const nextItems = updateMenuItems(
      menu.items,
      menu.handle,
      syncedPages
    );

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

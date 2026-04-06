type FirestoreProduct = {
  id: string;
  status: string;
  basic: {
    productName: string;
    description: string;
    category: string;
  };
  features: {
    name: string;
    description: string;
  }[];
  pricing: {
    plans: {
      name: string;
      introPrice: string;
      introTerm: string;
      renewalPrice: string;
      renewalTerm: string;
    }[];
    affiliateUrl?: URL | null;
  };
  media: {
    thumbnailUrl?: URL | null;
  };
};

const slugify = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

export const buildShopifyProductPayload = (
  product: FirestoreProduct
) => {
  /* ---------------- HANDLE ---------------- */
  const handle = `${slugify(
    product.basic.productName
  )}-${slugify(product.basic.category)}`;

  /* ---------------- FEATURES METAFIELD ---------------- */
  const featuresText = product.features
    .map(
      (f) => `. ${f.name} - ${f.description}`
    )
    .join("\n");

  /* ---------------- PLANS METAFIELD ---------------- */
  const plansText = product.pricing.plans
    .map(
      (plan) => `
${plan.name}
Intro Price: ${plan.introPrice} Term: ${plan.introTerm}
Renewal Price: ${plan.renewalPrice} Renewal Term: ${plan.renewalTerm}
`
    )
    .join("\n");

  return {
    product: {
      title: product.basic.productName,
      handle,
      product_type: product.basic.category,
      body_html: product.basic.description,
      status: "active",

      variants: [
        {
          price:
            product.pricing.plans?.[0]
              ?.introPrice || "0",
        },
      ],

      
    },
  };
};

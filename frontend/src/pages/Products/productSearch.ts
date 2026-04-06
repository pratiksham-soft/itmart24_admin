export type ProductSearchCandidate = {
  id: string;
  vendorId?: string | null;
  businessName?: string | null;
  status?: string | null;
  vendor?: {
    basic?: {
      subCategoryName?: string | null;
    };
  };
  basic?: {
    productName?: string | null;
    category?: string | null;
    description?: string | null;
  };
  pricing?: {
    selectedPlan?: string | null;
    price?: number | string | null;
  };
};

const normalizeSearchValue = (value: string | number | null | undefined) =>
  String(value ?? "").trim().toLowerCase();

export const filterProductsByQuery = <T extends ProductSearchCandidate>(
  products: T[],
  searchQuery: string
) => {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  if (!normalizedQuery) {
    return products;
  }

  return products.filter((product) =>
    [
      product.id,
      product.vendorId,
      product.businessName,
      product.status,
      product.vendor?.basic?.subCategoryName,
      product.basic?.productName,
      product.basic?.category,
      product.basic?.description,
      product.pricing?.selectedPlan,
      product.pricing?.price,
    ].some((value) => normalizeSearchValue(value).includes(normalizedQuery))
  );
};

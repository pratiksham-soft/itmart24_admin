import { useEffect, useRef, useState } from "react";

export type StatusProductRow = {
  id: string;
  vendorId: string;
  businessName: string;
  shopifyProductURL: string | null;
  shopifyStatus?: string;
  shopifyProductId?: number | null;
  shopifyHandle?: string | null;
  activeSubscription?: {
    hasActiveSubscription: boolean;
    activeSubscriptionCount: number;
    activeSubscriptionMessage: string | null;
  };
  vendor?: {
    basic?: {
      subCategoryName?: string;
    };
  };
  basic: {
    productName: string;
    category: string;
    description: string;
  };
  pricing: {
    price: number;
    selectedPlan: string;
  };
  status: string;
};

type PaginatedStatusProductsResponse = {
  success: boolean;
  count: number;
  data: StatusProductRow[];
  page?: number;
  pageSize?: number;
  totalPages?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  message?: string;
};

type UsePaginatedStatusProductsOptions = {
  endpoint: string;
  pageSize?: number;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Failed to load products";

export const usePaginatedStatusProducts = ({
  endpoint,
  pageSize = 25,
}: UsePaginatedStatusProductsOptions) => {
  const [products, setProducts] = useState<StatusProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQueryState] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const requestProducts = async (
    requestedPage: number,
    requestedSearchQuery: string
  ) => {
    const params = new URLSearchParams({
      page: String(requestedPage),
      pageSize: String(pageSize),
    });
    const trimmedSearchQuery = requestedSearchQuery.trim();

    if (trimmedSearchQuery) {
      params.set("search", trimmedSearchQuery);
    }

    const response = await fetch(`${endpoint}?${params.toString()}`);
    const result: PaginatedStatusProductsResponse = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Failed to load products");
    }

    return result;
  };

  const fetchProducts = async (
    requestedPage = page,
    requestedSearchQuery = searchQuery
  ) => {
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;

    if (hasLoadedRef.current) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const result = await requestProducts(requestedPage, requestedSearchQuery);

      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      const nextTotalPages = result.totalPages ?? 1;

      if (requestedPage > nextTotalPages) {
        setPage(nextTotalPages);
        return;
      }

      setProducts(Array.isArray(result.data) ? result.data : []);
      setTotalCount(result.count ?? 0);
      setTotalPages(nextTotalPages);

      if (
        typeof result.page === "number" &&
        result.page !== requestedPage
      ) {
        setPage(result.page);
      }

      hasLoadedRef.current = true;
    } catch (fetchError) {
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      console.error("Failed to fetch paginated products", fetchError);
      setProducts([]);
      setTotalCount(0);
      setTotalPages(1);
      setError(getErrorMessage(fetchError));
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery]);

  useEffect(() => {
    void fetchProducts(page, debouncedSearchQuery);
  }, [debouncedSearchQuery, endpoint, page, pageSize]);

  const setSearchQuery = (value: string) => {
    setPage(1);
    setSearchQueryState(value);
  };

  const handlePageClick = (pageNumber: number) => {
    if (
      loading ||
      isRefreshing ||
      pageNumber < 1 ||
      pageNumber > totalPages ||
      pageNumber === page
    ) {
      return;
    }

    setPage(pageNumber);
  };

  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);
  const isPageLoading = loading || isRefreshing;

  return {
    products,
    loading,
    isRefreshing,
    isPageLoading,
    error,
    searchQuery,
    setSearchQuery,
    page,
    totalCount,
    totalPages,
    startItem,
    endItem,
    handlePageClick,
    refetchProducts: async () => {
      await fetchProducts(page, debouncedSearchQuery);
    },
  };
};

import { useEffect, useState } from "react";
import axios from "axios";
import {
    TrashBinIcon,
    CheckLineIcon,
    CloseLineIcon,
} from "../../../icons";
import {
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableRow,
} from "../../../components/ui/table";

interface SubSubCategory {
    id: string;
    name: string;
    isActive: boolean;
}

interface SubCategory {
    id: string;
    name: string;
    isActive: boolean;
    subsubcategories: SubSubCategory[];
}

interface MainCategory {
    id: string;
    name: string;
    isActive: boolean;
    subcategories: SubCategory[];
}

const ProductCategoryMaster = () => {
    const [categories, setCategories] = useState<MainCategory[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [categoryType, setCategoryType] = useState<"main" | "sub" | "subsub">("main");
    const [selectedMain, setSelectedMain] = useState("");
    const [selectedSub, setSelectedSub] = useState("");
    const [categoryName, setCategoryName] = useState("");
    const [saving, setSaving] = useState(false);
    const [expandedMain, setExpandedMain] = useState<string | null>(null);
    const [expandedSub, setExpandedSub] = useState<string | null>(null);


    const API_BASE = "/api/product-categories";

    const fetchCategories = async () => {
        try {
            setLoading(true);
            const res = await axios.get(API_BASE);
            setCategories(res.data);
        } catch (err) {
            setError("Failed to load categories");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);


    const handleSaveCategory = async () => {
        if (!categoryName.trim()) {
            alert("Category name is required");
            return;
        }

        try {
            setSaving(true);

            if (categoryType === "main") {
                await axios.post(`${API_BASE}/main-category`, {
                    name: categoryName,
                });
            }

            if (categoryType === "sub") {
                if (!selectedMain) {
                    alert("Please select main category");
                    return;
                }

                await axios.post(`${API_BASE}/sub-category`, {
                    mainCategoryId: selectedMain,
                    name: categoryName,
                });
            }

            if (categoryType === "subsub") {
                if (!selectedMain || !selectedSub) {
                    alert("Please select main and sub category");
                    return;
                }

                await axios.post(`${API_BASE}/sub-sub-category`, {
                    mainCategoryId: selectedMain,
                    subCategoryId: selectedSub,
                    name: categoryName,
                });
            }

            // reset
            setCategoryName("");
            setSelectedMain("");
            setSelectedSub("");
            setCategoryType("main");
            setIsPanelOpen(false);

            fetchCategories();
        } catch (error) {
            console.error(error);
            alert("Failed to save category");
        } finally {
            setSaving(false);
        }
    };


    const handleDeleteMain = async (id: string) => {
        if (!confirm("Delete this category and all children?")) return;

        await axios.patch(`${API_BASE}/main-category/${id}/delete`);
        fetchCategories();
    };

    const handleDeleteSub = async (mainId: string, subId: string) => {
        if (!confirm("Delete this sub category and its children?")) return;

        await axios.patch(
            `${API_BASE}/sub-category/${mainId}/${subId}/delete`
        );
        fetchCategories();
    };

    const handleDeleteSubSub = async (
        mainId: string,
        subId: string,
        subSubId: string
    ) => {
        if (!confirm("Delete this category?")) return;

        await axios.patch(
            `${API_BASE}/sub-sub-category/${mainId}/${subId}/${subSubId}/delete`
        );
        fetchCategories();
    };

    const handleToggleActiveMain = async (
        id: string,
        isActive: boolean
    ) => {
        await axios.patch(`${API_BASE}/main-category/${id}`, {
            isActive: !isActive,
        });
        fetchCategories();
    };


    const ActionButton = ({
        onClick,
        title,
        children,
        color = "default",
    }: {
        onClick: () => void;
        title: string;
        children: React.ReactNode;
        color?: "default" | "danger" | "primary";
    }) => {
        const base =
            "p-2 rounded-md transition-all duration-150 hover:scale-105";

        const variants = {
            default:
                "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.08]",
            primary:
                "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20",
            danger:
                "text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20",
        };

        return (
            <button
                onClick={onClick}
                title={title}
                className={`${base} ${variants[color]}`}
            >
                {children}
            </button>
        );
    };


    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
                    Product Category Master
                </h1>

                <button
                    onClick={() => setIsPanelOpen(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                    + Create Category
                </button>
            </div>

            {/* States */}
            {loading && (
                <div className="text-gray-500">
                    Loading categories...
                </div>
            )}

            {error && (
                <div className="text-red-600">{error}</div>
            )}

            {/* Table */}
            {!loading && !error && (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
                    <div className="max-w-full overflow-x-auto">
                        <Table>
                            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                                <TableRow>
                                    <TableCell
                                        isHeader
                                        className="px-5 py-3 text-start font-medium text-gray-500 text-theme-xs dark:text-gray-400"
                                    >
                                        Main Category
                                    </TableCell>

                                    <TableCell
                                        isHeader
                                        className="px-5 py-3 text-start font-medium text-gray-500 text-theme-xs dark:text-gray-400"
                                    >
                                        Sub Categories
                                    </TableCell>

                                    <TableCell
                                        isHeader
                                        className="px-5 py-3 text-start font-medium text-gray-500 text-theme-xs dark:text-gray-400"
                                    >
                                        Sub-Sub Categories
                                    </TableCell>
                                </TableRow>
                            </TableHeader>

                            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                                {categories.map((cat) => (
                                    <>
                                        {/* MAIN CATEGORY ROW */}
                                        <TableRow key={cat.id}>
                                            <TableCell className="px-5 py-4 text-start font-medium text-gray-800 dark:text-white/90">
                                                <button
                                                    onClick={() =>
                                                        setExpandedMain(
                                                            expandedMain === cat.id ? null : cat.id
                                                        )
                                                    }
                                                    className="mr-2 text-blue-600"
                                                >
                                                    {expandedMain === cat.id ? "−" : "+"}
                                                </button>
                                                <div className="flex items-center justify-between">
                                                    <span>{cat.name}</span>

                                                    <div className="flex items-center gap-1">
                                                        <ActionButton
                                                            onClick={() =>
                                                                handleToggleActiveMain(cat.id, cat.isActive)
                                                            }
                                                            title={
                                                                cat.isActive ? "Deactivate Category" : "Activate Category"
                                                            }
                                                            color="primary"
                                                        >
                                                            {cat.isActive ? (
                                                                <CheckLineIcon className="w-4 h-4" />
                                                            ) : (
                                                                <CloseLineIcon className="w-4 h-4" />
                                                            )}
                                                        </ActionButton>

                                                        <ActionButton
                                                            onClick={() => handleDeleteMain(cat.id)}
                                                            title="Delete Category"
                                                            color="danger"
                                                        >
                                                            <TrashBinIcon className="w-4 h-4" />
                                                        </ActionButton>
                                                    </div>
                                                </div>
                                            </TableCell>

                                            <TableCell  className="px-5 py-4 text-start font-medium text-gray-800 dark:text-white/90">
                                                {cat.subcategories.length}
                                            </TableCell>

                                            <TableCell  className="px-5 py-4 text-start font-medium text-gray-800 dark:text-white/90">
                                                {cat.subcategories.reduce(
                                                    (acc, s) => acc + s.subsubcategories.length,
                                                    0
                                                )}
                                            </TableCell>
                                        </TableRow>

                                        {/* SUB CATEGORY ROWS */}
                                        {expandedMain === cat.id &&
                                            cat.subcategories.map((sub) => (
                                                <>
                                                    <TableRow key={sub.id}>
                                                        <TableCell className="pl-12 py-3 text-gray-700 dark:text-gray-300">
                                                            <button
                                                                onClick={() =>
                                                                    setExpandedSub(
                                                                        expandedSub === sub.id
                                                                            ? null
                                                                            : sub.id
                                                                    )
                                                                }
                                                                className="mr-2 text-blue-500"
                                                            >
                                                                {expandedSub === sub.id ? "−" : "+"}
                                                            </button>
                                                            <div className="flex items-center justify-between">
                                                                <span>{sub.name}</span>
                                                                <div className="flex justify-end">
                                                                    <ActionButton
                                                                        onClick={() =>
                                                                            handleDeleteSub(cat.id, sub.id)
                                                                        }
                                                                        title="Delete Sub Category"
                                                                        color="danger"
                                                                    >
                                                                        <TrashBinIcon className="w-4 h-4" />
                                                                    </ActionButton>
                                                                </div>
                                                            </div>
                                                        </TableCell>

                                                        <TableCell className="py-3 dark:text-white/90">
                                                            —
                                                        </TableCell>

                                                        <TableCell className="py-3 dark:text-white/90">
                                                            {sub.subsubcategories.length}
                                                        </TableCell>
                                                    </TableRow>

                                                    {/* SUB SUB CATEGORY ROWS */}
                                                    {expandedSub === sub.id &&
                                                        sub.subsubcategories.map((sss) => (
                                                            <TableRow key={sss.id}>
                                                                <TableCell className="pl-20 py-2 text-gray-500 dark:text-gray-400">
                                                                    <div className="flex items-center justify-between">
                                                                        <span>{sss.name}</span>

                                                                        <ActionButton
                                                                            onClick={() =>
                                                                                handleDeleteSubSub(cat.id, sub.id, sss.id)
                                                                            }
                                                                            title="Delete Category"
                                                                            color="danger"
                                                                        >
                                                                            <TrashBinIcon className="w-4 h-4" />
                                                                        </ActionButton>
                                                                    </div>
                                                                </TableCell>

                                                                <TableCell className="py-2 text-gray-400">
                                                                    —
                                                                </TableCell>

                                                                <TableCell className="py-2 text-gray-400">
                                                                    —
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                </>
                                            ))}
                                    </>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}

            {/* Side Panel Placeholder */}
            {isPanelOpen && (
                <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
                    <div className="bg-white w-[420px] h-full p-6 flex flex-col">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h2 className="text-xl font-semibold">
                                Create Category
                            </h2>
                            <button
                                onClick={() => setIsPanelOpen(false)}
                                className="text-gray-500 text-xl"
                            >
                                ×
                            </button>
                        </div>

                        {/* Form Content */}
                        <div className="space-y-5 overflow-y-auto">

                            {/* Category Type */}
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Category Type
                                </label>
                                <select
                                    className="w-full border rounded px-3 py-2"
                                    value={categoryType}
                                    onChange={(e) =>
                                        setCategoryType(e.target.value as any)
                                    }
                                >
                                    <option value="main">Main Category</option>
                                    <option value="sub">Sub Category</option>
                                    <option value="subsub">Sub Sub Category</option>
                                </select>
                            </div>

                            {/* Main Category Dropdown */}
                            {categoryType !== "main" && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Select Main Category
                                    </label>
                                    <select
                                        className="w-full border rounded px-3 py-2"
                                        value={selectedMain}
                                        onChange={(e) => {
                                            setSelectedMain(e.target.value);
                                            setSelectedSub("");
                                        }}
                                    >
                                        <option value="">Select Main Category</option>
                                        {categories.map((cat) => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Sub Category Dropdown */}
                            {categoryType === "subsub" && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Select Sub Category
                                    </label>
                                    <select
                                        className="w-full border rounded px-3 py-2"
                                        value={selectedSub}
                                        onChange={(e) =>
                                            setSelectedSub(e.target.value)
                                        }
                                    >
                                        <option value="">Select Sub Category</option>
                                        {categories
                                            .find((c) => c.id === selectedMain)
                                            ?.subcategories.map((sub) => (
                                                <option key={sub.id} value={sub.id}>
                                                    {sub.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            )}

                            {/* Category Name */}
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Category Name
                                </label>
                                <input
                                    type="text"
                                    className="w-full border rounded px-3 py-2"
                                    placeholder="Enter category name"
                                    value={categoryName}
                                    onChange={(e) =>
                                        setCategoryName(e.target.value)
                                    }
                                />
                            </div>

                        </div>

                        {/* Footer */}
                        <div className="mt-auto pt-4 border-t flex justify-end gap-3">
                            <button
                                onClick={() => setIsPanelOpen(false)}
                                className="px-4 py-2 text-gray-600"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveCategory}
                                disabled={saving}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
                            >
                                {saving ? "Saving..." : "Save Category"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ProductCategoryMaster;

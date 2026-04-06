import { SubscriptionPlan } from "./types";

type Props = {
    plan: SubscriptionPlan;
    onClose: () => void;
};

const PlanView = ({ plan, onClose }: Props) => {
    return (
        <div className="fixed inset-x-0 top-16 bottom-0 z-50 flex">
            {/* BACKDROP */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
            />

            {/* SIDE PANEL */}
            <div className="relative ml-auto w-[420px] h-full bg-white shadow-xl flex flex-col">
                {/* HEADER (STICKY) */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h2 className="text-lg font-semibold">
                        {plan.name}
                    </h2>

                    <button
                        onClick={onClose}
                        className="text-2xl text-gray-600 hover:text-black"
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                {/* SCROLLABLE CONTENT */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* PRICING */}
                    <div>
                        <p className="font-medium mb-2">Pricing</p>
                        <div className="space-y-2">
                            {plan.periods.map((p) => (
                                <div
                                    key={p.id}
                                    className="flex justify-between text-sm"
                                >
                                    <span>
                                        {p.label} ({p.durationInMonths} months)
                                    </span>
                                    <span className="font-medium">
                                        ₹{p.price}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* FEATURES */}
                    <div>
                        <p className="font-medium mb-2">Features</p>
                        <div className="space-y-3">
                            {plan.features.map((f, i) => (
                                <div key={i}>
                                    <p className="font-semibold text-sm">
                                        {f.title}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                        {f.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlanView;

import React from "react";
import GridShape from "../../components/common/GridShape";
import ThemeTogglerTwo from "../../components/common/ThemeTogglerTwo";
import AuthBrand from "../../components/auth/AuthBrand";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <div className="relative flex flex-col justify-center w-full h-screen lg:flex-row dark:bg-gray-900 sm:p-0">
        {children}
        <div className="items-center hidden w-full h-full lg:w-1/2 bg-brand-950 dark:bg-white/5 lg:grid">
          <div className="relative flex items-center justify-center z-1">
            <GridShape />
            <div className="max-w-md px-10">
              <div className="rounded-[32px] border border-white/10 bg-white/10 p-10 backdrop-blur-sm">
                <AuthBrand
                  align="center"
                  subtitle="Securely manage ITMart24 products, vendors, support, and back-office operations from one admin workspace."
                />
                <div className="mt-8 space-y-4 text-sm text-center text-brand-100">
                  <p>Email/password authentication is isolated from the rest of the system data.</p>
                  <p>Admin profiles are stored only in the dedicated Firestore `admins` collection.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="fixed z-50 hidden bottom-6 right-6 sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}

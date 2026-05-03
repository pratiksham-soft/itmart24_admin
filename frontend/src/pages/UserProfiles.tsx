import { useEffect, useMemo, useState } from "react";
import PageBreadcrumb from "../components/common/PageBreadCrumb";
import PageMeta from "../components/common/PageMeta";
import Label from "../components/form/Label";
import Input from "../components/form/input/InputField";
import Button from "../components/ui/button/Button";
import {
  changeAdminPassword,
  getCurrentAdminProfile,
  type AdminUser,
} from "../services/adminAuth.service";

const formatRole = (value: string) =>
  value.replace(/[_-]/g, " ").replace(/^./, (match) => match.toUpperCase());

export default function UserProfiles() {
  const [profile, setProfile] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [formValues, setFormValues] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      setLoading(true);

      try {
        const nextProfile = await getCurrentAdminProfile();

        if (isMounted) {
          setProfile(nextProfile);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const displayName = useMemo(() => {
    return String(profile?.name ?? profile?.email ?? "Admin User").trim() || "Admin User";
  }, [profile]);

  const handleFieldChange = (field: string, value: string) => {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
    setStatus(null);
  };

  const validateChangePasswordForm = () => {
    const nextErrors: Record<string, string> = {};

    if (!formValues.currentPassword) {
      nextErrors.currentPassword = "Current password is required.";
    }

    if (!formValues.newPassword) {
      nextErrors.newPassword = "New password is required.";
    } else if (
      formValues.newPassword.length < 8 ||
      !/[A-Za-z]/.test(formValues.newPassword) ||
      !/\d/.test(formValues.newPassword)
    ) {
      nextErrors.newPassword =
        "Use at least 8 characters with letters and numbers.";
    }

    if (!formValues.confirmNewPassword) {
      nextErrors.confirmNewPassword = "Confirm password is required.";
    } else if (formValues.newPassword !== formValues.confirmNewPassword) {
      nextErrors.confirmNewPassword =
        "New password and confirm password must match.";
    }

    return nextErrors;
  };

  const handleChangePassword = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const errors = validateChangePasswordForm();
    setFieldErrors(errors);
    setStatus(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await changeAdminPassword({
        currentPassword: formValues.currentPassword,
        newPassword: formValues.newPassword,
      });

      setStatus({
        type: "success",
        message: result.message || "Password updated successfully.",
      });
      setFormValues({
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: "",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to change password right now.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Account Settings | ITMart24 Admin"
        description="Review admin account details and update your ITMart24 admin password."
      />
      <PageBreadcrumb pageTitle="Account Settings" />

      <div className="space-y-6">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Account Overview
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Your current admin identity and workspace access details.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              Loading account details...
            </p>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                <p className="text-xs uppercase tracking-[0.12em] text-gray-400">
                  Name
                </p>
                <p className="mt-2 text-sm font-medium text-gray-800 dark:text-white/90">
                  {displayName}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                <p className="text-xs uppercase tracking-[0.12em] text-gray-400">
                  Email
                </p>
                <p className="mt-2 text-sm font-medium text-gray-800 dark:text-white/90">
                  {profile?.email || "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                <p className="text-xs uppercase tracking-[0.12em] text-gray-400">
                  Role
                </p>
                <p className="mt-2 text-sm font-medium text-gray-800 dark:text-white/90">
                  {formatRole(String(profile?.role ?? "admin"))}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
                <p className="text-xs uppercase tracking-[0.12em] text-gray-400">
                  Admin ID
                </p>
                <p className="mt-2 break-all text-sm font-medium text-gray-800 dark:text-white/90">
                  {profile?.id ?? "-"}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Change Password
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Update your admin password after confirming your current password.
            </p>
          </div>

          {status ? (
            <div
              className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                status.type === "success"
                  ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300"
                  : "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300"
              }`}
            >
              {status.message}
            </div>
          ) : null}

          <form onSubmit={handleChangePassword} className="mt-6 space-y-5" noValidate>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <Label>
                  Current Password<span className="text-error-500">*</span>
                </Label>
                <Input
                  id="current-password"
                  name="current-password"
                  type="password"
                  placeholder="Enter your current password"
                  value={formValues.currentPassword}
                  onChange={(event) =>
                    handleFieldChange("currentPassword", event.target.value)
                  }
                  error={Boolean(fieldErrors.currentPassword)}
                  hint={fieldErrors.currentPassword}
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <Label>
                  New Password<span className="text-error-500">*</span>
                </Label>
                <Input
                  id="new-password"
                  name="new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={formValues.newPassword}
                  onChange={(event) =>
                    handleFieldChange("newPassword", event.target.value)
                  }
                  error={Boolean(fieldErrors.newPassword)}
                  hint={
                    fieldErrors.newPassword ??
                    "Use at least 8 characters with letters and numbers."
                  }
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <Label>
                  Confirm New Password<span className="text-error-500">*</span>
                </Label>
                <Input
                  id="confirm-new-password"
                  name="confirm-new-password"
                  type="password"
                  placeholder="Re-enter your new password"
                  value={formValues.confirmNewPassword}
                  onChange={(event) =>
                    handleFieldChange("confirmNewPassword", event.target.value)
                  }
                  error={Boolean(fieldErrors.confirmNewPassword)}
                  hint={fieldErrors.confirmNewPassword}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                className="min-w-[180px]"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Updating Password..." : "Update Password"}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}

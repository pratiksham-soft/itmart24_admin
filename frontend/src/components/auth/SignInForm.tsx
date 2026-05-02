import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronLeftIcon, EyeCloseIcon, EyeIcon } from "../../icons";
import {
  getAuthErrorMessage,
  signInAdmin,
} from "../../services/adminAuth.service";
import {
  type AuthFormErrors,
  validateSignInForm,
} from "../../utils/authValidation";
import AuthBrand from "./AuthBrand";
import Label from "../form/Label";
import Input from "../form/input/InputField";
import Checkbox from "../form/input/Checkbox";
import Button from "../ui/button/Button";

export default function SignInForm() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formValues, setFormValues] = useState({
    email: "",
    password: "",
    rememberMe: true,
  });
  const [fieldErrors, setFieldErrors] = useState<AuthFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const updateField = (field: string, value: string | boolean) => {
    setFormValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
    setStatus(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const errors = validateSignInForm(formValues);
    setFieldErrors(errors);
    setStatus(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      await signInAdmin({
        email: formValues.email.trim(),
        password: formValues.password,
        rememberMe: formValues.rememberMe,
      });

      setStatus({
        type: "success",
        message: "Sign-in successful. Redirecting to dashboard...",
      });

      window.setTimeout(() => {
        navigate("/", { replace: true });
      }, 700);
    } catch (error) {
      setStatus({
        type: "error",
        message: getAuthErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="w-full max-w-xl px-6 pt-10 mx-auto sm:px-8">
        <Link
          to="/"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon className="size-5" />
          Back to dashboard
        </Link>
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-xl px-6 mx-auto sm:px-8">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-gray-100/50 dark:border-white/10 dark:bg-white/5 dark:shadow-none sm:p-8">
          <AuthBrand subtitle="Sign in to the ITMart24 admin workspace with your PostgreSQL-backed admin account." />

          <div className="mt-8 mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Sign In
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Enter your admin email and password to continue.
            </p>
          </div>

          {status && (
            <div
              className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
                status.type === "success"
                  ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300"
                  : "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300"
              }`}
            >
              {status.message}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-6">
              <div>
                <Label>
                  Email<span className="text-error-500">*</span>
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@itmart24.com"
                  value={formValues.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  error={Boolean(fieldErrors.email)}
                  hint={fieldErrors.email}
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <Label>
                  Password<span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={formValues.password}
                    onChange={(event) =>
                      updateField("password", event.target.value)
                    }
                    error={Boolean(fieldErrors.password)}
                    hint={fieldErrors.password}
                    disabled={isSubmitting}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-600 dark:hover:text-gray-200"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeIcon className="fill-current size-5" />
                    ) : (
                      <EyeCloseIcon className="fill-current size-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={formValues.rememberMe}
                    onChange={(checked) => updateField("rememberMe", checked)}
                    disabled={isSubmitting}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Keep me logged in
                  </span>
                </div>
              </div>

              <Button className="w-full" size="sm" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </div>
          </form>

          <div className="mt-6">
            <p className="text-sm text-center text-gray-600 dark:text-gray-400 sm:text-left">
              Don&apos;t have an account?{" "}
              <Link
                to="/signup"
                className="font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

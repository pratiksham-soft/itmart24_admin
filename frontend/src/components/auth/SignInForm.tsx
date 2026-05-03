import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { EyeCloseIcon, EyeIcon } from "../../icons";
import {
  getAuthErrorMessage,
  requestAdminForgotPasswordOtp,
  signInAdmin,
  verifyAdminForgotPasswordOtp,
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

type ForgotPasswordStep = "request" | "verify";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateForgotPasswordRequest = (email: string) => {
  if (!email.trim()) {
    return "Email is required.";
  }

  if (!emailPattern.test(email.trim())) {
    return "Enter a valid email address.";
  }

  return "";
};

export default function SignInForm() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formValues, setFormValues] = useState({
    email: "",
    password: "",
    rememberMe: true,
  });
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordStep, setForgotPasswordStep] =
    useState<ForgotPasswordStep>("request");
  const [forgotPasswordValues, setForgotPasswordValues] = useState({
    email: "",
    otp: "",
  });
  const [fieldErrors, setFieldErrors] = useState<AuthFormErrors>({});
  const [forgotPasswordErrors, setForgotPasswordErrors] = useState<AuthFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotPasswordSubmitting, setIsForgotPasswordSubmitting] =
    useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [forgotPasswordStatus, setForgotPasswordStatus] = useState<{
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

  const updateForgotPasswordField = (field: string, value: string) => {
    setForgotPasswordValues((current) => ({ ...current, [field]: value }));
    setForgotPasswordErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
    setForgotPasswordStatus(null);
  };

  const resetForgotPasswordFlow = () => {
    setForgotPasswordStep("request");
    setForgotPasswordErrors({});
    setForgotPasswordStatus(null);
    setForgotPasswordValues((current) => ({
      email: current.email || formValues.email.trim(),
      otp: "",
    }));
  };

  const toggleForgotPassword = () => {
    setForgotPasswordOpen((current) => {
      const next = !current;

      if (next) {
        setForgotPasswordValues((previous) => ({
          ...previous,
          email: previous.email || formValues.email.trim(),
        }));
        setForgotPasswordErrors({});
        setForgotPasswordStatus(null);
      } else {
        resetForgotPasswordFlow();
      }

      return next;
    });
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

  const handleSendOtp = async () => {
    const emailError = validateForgotPasswordRequest(forgotPasswordValues.email);

    if (emailError) {
      setForgotPasswordErrors({ email: emailError });
      setForgotPasswordStatus({
        type: "error",
        message: emailError,
      });
      return;
    }

    setIsForgotPasswordSubmitting(true);
    setForgotPasswordErrors({});
    setForgotPasswordStatus(null);

    try {
      const result = await requestAdminForgotPasswordOtp(
        forgotPasswordValues.email.trim()
      );
      setForgotPasswordStep("verify");
      setForgotPasswordValues((current) => ({
        ...current,
        email: current.email.trim(),
        otp: "",
      }));
      setForgotPasswordStatus({
        type: "success",
        message:
          result.message ||
          "If an admin account exists for that email, a password reset OTP has been sent.",
      });
    } catch (error) {
      setForgotPasswordStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to send OTP right now. Please try again.",
      });
    } finally {
      setIsForgotPasswordSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    const nextErrors: AuthFormErrors = {};
    const emailError = validateForgotPasswordRequest(forgotPasswordValues.email);

    if (emailError) {
      nextErrors.email = emailError;
    }

    if (!forgotPasswordValues.otp.trim()) {
      nextErrors.otp = "OTP is required.";
    } else if (!/^\d{6}$/.test(forgotPasswordValues.otp.trim())) {
      nextErrors.otp = "Enter the 6-digit OTP.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setForgotPasswordErrors(nextErrors);
      setForgotPasswordStatus({
        type: "error",
        message: nextErrors.email || nextErrors.otp || "Please complete the form.",
      });
      return;
    }

    setIsForgotPasswordSubmitting(true);
    setForgotPasswordErrors({});
    setForgotPasswordStatus(null);

    try {
      const result = await verifyAdminForgotPasswordOtp(
        forgotPasswordValues.email.trim(),
        forgotPasswordValues.otp.trim()
      );
      setForgotPasswordOpen(false);
      resetForgotPasswordFlow();
      setStatus({
        type: "success",
        message:
          result.message ||
          "OTP verified successfully. Redirecting to your account settings.",
      });
      window.setTimeout(() => {
        navigate("/profile", { replace: true });
      }, 700);
    } catch (error) {
      setForgotPasswordStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to verify OTP right now. Please try again.",
      });
    } finally {
      setIsForgotPasswordSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="flex flex-col justify-center flex-1 w-full max-w-xl px-6 mx-auto sm:px-8">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-gray-100/50 dark:border-white/10 dark:bg-white/5 dark:shadow-none sm:p-8">
          <AuthBrand subtitle="Sign in to the ITMart24 admin workspace and recover access with secure OTP verification if needed." />

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

              <Button className="w-full" size="sm" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>

              <div className="flex justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={toggleForgotPassword}
                  className="text-sm font-medium text-brand-500 transition hover:text-brand-600 dark:text-brand-400"
                >
                  {forgotPasswordOpen
                    ? "Hide forgot password"
                    : "Forgot password? Get OTP"}
                </button>
              </div>

              {forgotPasswordOpen ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Password Reset with OTP
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {forgotPasswordStep === "request"
                        ? "Enter your admin email to receive a one-time password."
                        : "Enter the OTP sent to your email to sign in to your account."}
                    </p>
                  </div>

                  {forgotPasswordStatus ? (
                    <div
                      className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
                        forgotPasswordStatus.type === "success"
                          ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300"
                          : "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-300"
                      }`}
                    >
                      {forgotPasswordStatus.message}
                    </div>
                  ) : null}

                  <div className="space-y-4">
                    <div>
                      <Label>
                        Registered Admin Email<span className="text-error-500">*</span>
                      </Label>
                      <Input
                        id="forgot-email"
                        name="forgot-email"
                        type="email"
                        placeholder="admin@itmart24.com"
                        value={forgotPasswordValues.email}
                        onChange={(event) =>
                          updateForgotPasswordField("email", event.target.value)
                        }
                        error={Boolean(forgotPasswordErrors.email)}
                        hint={forgotPasswordErrors.email}
                        disabled={isForgotPasswordSubmitting}
                      />
                    </div>

                    {forgotPasswordStep !== "request" ? (
                      <div>
                        <Label>
                          OTP<span className="text-error-500">*</span>
                        </Label>
                        <Input
                          id="forgot-otp"
                          name="forgot-otp"
                          type="text"
                          placeholder="Enter 6-digit OTP"
                          value={forgotPasswordValues.otp}
                          onChange={(event) =>
                            updateForgotPasswordField("otp", event.target.value)
                          }
                          error={Boolean(forgotPasswordErrors.otp)}
                          hint={forgotPasswordErrors.otp}
                          disabled={isForgotPasswordSubmitting}
                        />
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3 sm:flex-row">
                      {forgotPasswordStep === "request" ? (
                        <Button
                          type="button"
                          className="w-full"
                          size="sm"
                          onClick={handleSendOtp}
                          disabled={isForgotPasswordSubmitting}
                        >
                          {isForgotPasswordSubmitting ? "Sending OTP..." : "Send OTP"}
                        </Button>
                      ) : null}

                      {forgotPasswordStep === "verify" ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            size="sm"
                            onClick={handleSendOtp}
                            disabled={isForgotPasswordSubmitting}
                          >
                            {isForgotPasswordSubmitting ? "Working..." : "Resend OTP"}
                          </Button>
                          <Button
                            type="button"
                            className="w-full"
                            size="sm"
                            onClick={handleVerifyOtp}
                            disabled={isForgotPasswordSubmitting}
                          >
                            {isForgotPasswordSubmitting ? "Verifying..." : "Verify OTP"}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
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

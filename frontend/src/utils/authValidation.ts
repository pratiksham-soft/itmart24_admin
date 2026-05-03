export type SignUpFormValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type SignInFormValues = {
  email: string;
  password: string;
};

export type AuthFormErrors = Partial<Record<string, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isStrongEnoughPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password)
  );
}

export function validateSignUpForm(values: SignUpFormValues): AuthFormErrors {
  const errors: AuthFormErrors = {};

  if (!values.name.trim()) {
    errors.name = "Name is required.";
  }

  if (!values.email.trim()) {
    errors.email = "Email is required.";
  } else if (!emailPattern.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (!values.password) {
    errors.password = "Password is required.";
  } else if (!isStrongEnoughPassword(values.password)) {
    errors.password = "Use at least 8 characters with letters and numbers.";
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Confirm password is required.";
  } else if (values.password !== values.confirmPassword) {
    errors.confirmPassword = "Password and confirm password must match.";
  }

  return errors;
}

export function validateSignInForm(values: SignInFormValues): AuthFormErrors {
  const errors: AuthFormErrors = {};

  if (!values.email.trim()) {
    errors.email = "Email is required.";
  } else if (!emailPattern.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (!values.password) {
    errors.password = "Password is required.";
  }

  return errors;
}

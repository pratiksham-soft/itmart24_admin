export type SignUpFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  acceptTerms: boolean;
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

  if (!values.firstName.trim()) {
    errors.firstName = "First name is required.";
  }

  if (!values.lastName.trim()) {
    errors.lastName = "Last name is required.";
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

  if (!values.acceptTerms) {
    errors.acceptTerms = "You need to accept the terms to continue.";
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


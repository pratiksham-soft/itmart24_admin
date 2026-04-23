import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignUpForm from "../../components/auth/SignUpForm";

export default function SignUp() {
  return (
    <>
      <PageMeta
        title="Sign Up | ITMart24 Admin"
        description="Create a secure ITMart24 admin account with Firebase Authentication."
      />
      <AuthLayout>
        <SignUpForm />
      </AuthLayout>
    </>
  );
}

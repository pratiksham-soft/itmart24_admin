import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Sign In | ITMart24 Admin"
        description="Sign in to the ITMart24 admin dashboard with your PostgreSQL admin account."
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}

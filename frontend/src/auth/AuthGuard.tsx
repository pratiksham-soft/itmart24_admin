import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { getCurrentAdminProfile } from "../services/adminAuth.service";

type AuthGuardProps = {
  children: React.ReactNode;
};

export default function AuthGuard({ children }: AuthGuardProps) {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const profile = await getCurrentAdminProfile();

        if (!isMounted) {
          return;
        }

        setIsAllowed(Boolean(profile));
      } catch {
        if (!isMounted) {
          return;
        }

        setIsAllowed(false);
      } finally {
        if (isMounted) {
          setChecking(false);
        }
      }
    };

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">
        Checking your admin session...
      </div>
    );
  }

  if (!isAllowed) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Sparkles, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppShell } from "@/components/layout/AppShell";
import { auth, isBrowser } from "@/lib/firebase";
import { hydrateRepos, migrateFromLocalStorage, stopRepos } from "@/repositories";
import { LoginPage } from "./login";

/** Remembers whether someone was signed in on this device, so the very first
 * paint can go straight to the right screen (login vs splash) with no blink. */
const AUTH_HINT_KEY = "bz.authHint";

function NotFoundComponent() {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-muted-foreground">Page not found</p>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "root" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-4 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AIM — Billing & Inventory ERP" },
      {
        name: "description",
        content: "Keyboard-first desktop billing, inventory, and accounting software.",
      },
      { property: "og:title", content: "AIM — Billing & Inventory ERP" },
      {
        property: "og:description",
        content: "Keyboard-first desktop billing, inventory, and accounting software.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
      <Toaster position="bottom-right" duration={3000} closeButton richColors />
    </QueryClientProvider>
  );
}

/**
 * Auth + data gate:
 *  - undefined user → checking session (splash)
 *  - no user → only /login is allowed
 *  - user → hydrate all cloud data (and one-time migrate old localStorage
 *    data) BEFORE rendering the app, since screens read repos synchronously.
 */
function AuthGate() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [dataReady, setDataReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isBrowser) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      try {
        if (u) localStorage.setItem(AUTH_HINT_KEY, "1");
        else localStorage.removeItem(AUTH_HINT_KEY);
      } catch {
        /* private mode */
      }
      if (!u) {
        stopRepos();
        setDataReady(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user || dataReady) return;
    let cancelled = false;
    (async () => {
      try {
        await hydrateRepos();
        const migrated = await migrateFromLocalStorage();
        if (migrated > 0) toast.success(`Moved ${migrated} records from this device to cloud`);
        if (!cancelled) setDataReady(true);
      } catch (err) {
        console.error("Data load failed", err);
        if (!cancelled)
          setLoadError(
            "Could not load your data from the cloud. Check your internet connection " +
            "and that Firestore security rules allow signed-in access, then reload.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, dataReady]);

  useEffect(() => {
    if (user === undefined) return;
    if (!user && pathname !== "/login") navigate({ to: "/login" });
    if (user && pathname === "/login") navigate({ to: "/" });
  }, [user, pathname, navigate]);

  // SSR + first client paint: neutral splash (avoids hydration mismatch)
  if (!mounted) return <SplashScreen />;

  const wasSignedIn = (() => {
    try {
      return localStorage.getItem(AUTH_HINT_KEY) === "1";
    } catch {
      return false;
    }
  })();

  // Login page renders without the app shell
  if (pathname === "/login") {
    if (user) return <SplashScreen />; // already signed in — redirecting to dashboard
    return <Outlet />;
  }

  // Signed out (or almost certainly signed out while the session check runs):
  // render the login page immediately — no dashboard/splash blink.
  if (user === null || (user === undefined && !wasSignedIn)) {
    return <LoginPage />;
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
          <h1 className="text-lg font-semibold">Couldn't load your data</h1>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          <button
            onClick={() => location.reload()}
            className="mt-4 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (user === undefined || !dataReady) return <SplashScreen />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function SplashScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <div className="h-14 w-14 rounded-2xl bg-gradient-brand text-brand-foreground flex items-center justify-center shadow-elevated">
        <Sparkles className="h-6 w-6" />
      </div>
      <div className="text-center">
        <p className="font-bold tracking-tight text-[18px]">AIM</p>
        <p className="text-[12px] text-muted-foreground flex items-center gap-1.5 justify-center mt-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your workspace…
        </p>
      </div>
    </div>
  );
}

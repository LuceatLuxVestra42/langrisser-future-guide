import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { EquipmentDetailModalBridge } from "../lib/equipment-detail-modal-bridge";
import { reportLovableError } from "../lib/lovable-error-reporting";

const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const SITE_VERSION_QUERY_KEY = "__v";

type SiteVersionState = "current" | "stale" | "unavailable" | "unversioned";

type PagesSourceManifest = {
  status?: unknown;
  sourceSha?: unknown;
  sourceRef?: unknown;
};

function publishSiteVersionState(
  status: SiteVersionState,
  currentSourceSha: string,
  deployedSourceSha = "",
) {
  const root = document.documentElement;
  root.dataset.siteVersionStatus = status;
  root.dataset.siteVersionCurrent = currentSourceSha;
  if (deployedSourceSha) {
    root.dataset.siteVersionDeployed = deployedSourceSha;
  } else {
    delete root.dataset.siteVersionDeployed;
  }

  window.dispatchEvent(
    new CustomEvent("site-version-state", {
      detail: { status, currentSourceSha, deployedSourceSha },
    }),
  );
}

function navigateToDeployedVersion(deployedSourceSha: string) {
  const target = new URL(window.location.href);
  if (target.searchParams.get(SITE_VERSION_QUERY_KEY) === deployedSourceSha) {
    return false;
  }

  target.searchParams.set(SITE_VERSION_QUERY_KEY, deployedSourceSha);
  document.documentElement.dataset.siteVersionNavigation = "requested";
  window.location.replace(target.toString());
  return true;
}

function SiteVersionGuard() {
  useEffect(() => {
    const currentSourceSha = import.meta.env.VITE_SITE_SOURCE_SHA?.trim() ?? "";

    if (!SOURCE_SHA_PATTERN.test(currentSourceSha)) {
      publishSiteVersionState("unversioned", currentSourceSha);
      return;
    }

    let cancelled = false;

    const checkVersion = async () => {
      try {
        const base = import.meta.env.BASE_URL || "/";
        const normalizedBase = base.endsWith("/") ? base : `${base}/`;
        const manifestUrl = new URL(
          `${normalizedBase}authoritative-pages-source.json`,
          window.location.origin,
        );
        manifestUrl.searchParams.set("site_version_check", String(Date.now()));

        const response = await fetch(manifestUrl, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Site version manifest returned HTTP ${response.status}`);
        }

        const manifest = (await response.json()) as PagesSourceManifest;
        const deployedSourceSha =
          typeof manifest.sourceSha === "string" ? manifest.sourceSha.trim() : "";

        if (
          manifest.status !== "AUTHORITATIVE_GITHUB_PAGES_DEPLOYMENT" ||
          manifest.sourceRef !== "main" ||
          !SOURCE_SHA_PATTERN.test(deployedSourceSha)
        ) {
          throw new Error("Site version manifest has an invalid deployment identity");
        }
        if (cancelled) return;

        const status: SiteVersionState =
          deployedSourceSha === currentSourceSha ? "current" : "stale";
        publishSiteVersionState(status, currentSourceSha, deployedSourceSha);

        if (status === "stale") {
          navigateToDeployedVersion(deployedSourceSha);
        }
      } catch {
        if (!cancelled) {
          publishSiteVersionState("unavailable", currentSourceSha);
        }
      }
    };

    void checkVersion();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "랑그릿사 모바일 미래시 정보" },
      { name: "description", content: "랑그릿사 모바일 한국 서버의 미래 정보를 한 곳에서 확인하는 유저 정보 사이트." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "랑그릿사 모바일 미래시 정보" },
      { property: "og:description", content: "랑그릿사 모바일 한국 서버의 미래 정보를 한 곳에서." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: `${import.meta.env.BASE_URL}favicon.ico`, type: "image/x-icon" },
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
      <SiteVersionGuard />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <EquipmentDetailModalBridge />
    </QueryClientProvider>
  );
}

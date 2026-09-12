import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ExistingRoute =
  | "/banners"
  | "/heroes"
  | "/equipment"
  | "/equipment/exclusive"
  | "/soldiers"
  | "/soldiers/training";

type NavItem = {
  label: string;
  to?: ExistingRoute;
  unavailableLabel?: string;
};

type NavGroup = {
  label: string;
  matchPrefixes: string[];
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "가챠 배너",
    matchPrefixes: ["/banners"],
    items: [
      { label: "배너표", to: "/banners" },
      { label: "1인배너 log", unavailableLabel: "직접 연결 준비" },
    ],
  },
  {
    label: "영웅",
    matchPrefixes: ["/heroes"],
    items: [
      { label: "영웅 리스트", to: "/heroes" },
      { label: "율정 모음" },
      { label: "유대" },
      { label: "무료 배포" },
    ],
  },
  {
    label: "장비",
    matchPrefixes: ["/equipment"],
    items: [
      { label: "SSR 장비", to: "/equipment" },
      { label: "전용장비", to: "/equipment/exclusive" },
    ],
  },
  {
    label: "용병",
    matchPrefixes: ["/soldiers"],
    items: [
      { label: "용병 리스트", to: "/soldiers" },
      { label: "훈련장", to: "/soldiers/training" },
    ],
  },
];

function isPathActive(pathname: string, target: ExistingRoute) {
  if (target === "/heroes" || target === "/soldiers") {
    return pathname === target || pathname.startsWith(`${target}/`);
  }

  if (target === "/equipment") {
    return pathname === target || (pathname.startsWith("/equipment/") && pathname !== "/equipment/exclusive");
  }

  return pathname === target;
}

export function SiteSectionNav() {
  const location = useLocation();

  if (location.pathname === "/") return null;

  return (
    <nav
      aria-label="주요 정보 페이지"
      className="sticky top-0 z-50 border-b border-border bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-1 overflow-x-auto px-3 py-2 sm:gap-2 sm:px-6 lg:px-8">
        {NAV_GROUPS.map((group) => {
          const groupActive = group.matchPrefixes.some((prefix) =>
            location.pathname.startsWith(prefix),
          );

          return (
            <DropdownMenu key={group.label}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                    groupActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {group.label}
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="start" className="min-w-44">
                {group.items.map((item) => {
                  if (!item.to) {
                    return (
                      <DropdownMenuItem key={item.label} disabled>
                        <span>{item.label}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {item.unavailableLabel ?? "준비 중"}
                        </span>
                      </DropdownMenuItem>
                    );
                  }

                  const itemActive = isPathActive(location.pathname, item.to);

                  return (
                    <DropdownMenuItem key={item.label} asChild>
                      <Link
                        to={item.to}
                        className={cn(itemActive && "bg-accent font-semibold text-accent-foreground")}
                      >
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
    </nav>
  );
}

import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

import clockIcon from "@/assets/clock_of_forgiveness.png";
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
  bannerView?: "single-log";
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
      { label: "1인 배너 log", bannerView: "single-log" },
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

  const singlePickupHref = `${import.meta.env.BASE_URL}banners?view=single-log`;

  return (
    <nav
      aria-label="주요 정보 페이지"
      className="relative z-50 border-b border-border bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 py-1 sm:px-8">
        <Link
          to="/"
          aria-label="미래시 시트 메인으로 이동"
          className="flex shrink-0 items-center gap-2.5 rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <img
            src={clockIcon}
            alt="용서의 시계"
            width={36}
            height={36}
            className="h-9 w-auto object-contain"
          />
          <span className="whitespace-nowrap text-base font-bold tracking-tight text-foreground sm:text-lg">
            미래시 시트
          </span>
        </Link>

        <div className="ml-auto flex min-w-0 items-center justify-end gap-1 overflow-x-auto py-1 sm:gap-2">
          {NAV_GROUPS.map((group) => {
            const groupActive = group.matchPrefixes.some((prefix) =>
              location.pathname.startsWith(prefix),
            );
            const hasUnavailableItems = group.items.some(
              (item) => !item.to && !item.bannerView,
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

                <DropdownMenuContent
                  align="end"
                  className={cn(
                    hasUnavailableItems ? "min-w-44" : "w-max min-w-0",
                  )}
                >
                  {group.items.map((item) => {
                    if (item.bannerView === "single-log") {
                      return (
                        <DropdownMenuItem
                          key={item.label}
                          asChild
                          className="px-4 py-3 text-sm"
                        >
                          <a href={singlePickupHref}>{item.label}</a>
                        </DropdownMenuItem>
                      );
                    }

                    if (!item.to) {
                      return (
                        <DropdownMenuItem
                          key={item.label}
                          disabled
                          className="px-4 py-3 text-sm"
                        >
                          <span>{item.label}</span>
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            {item.unavailableLabel ?? "준비 중"}
                          </span>
                        </DropdownMenuItem>
                      );
                    }

                    const itemActive = isPathActive(location.pathname, item.to);

                    return (
                      <DropdownMenuItem
                        key={item.label}
                        asChild
                        className="px-4 py-3 text-sm"
                      >
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
      </div>
    </nav>
  );
}

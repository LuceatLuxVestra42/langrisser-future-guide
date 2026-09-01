import { createServerFn } from "@tanstack/react-start";

import { readBannerPageData } from "./banner-page.server";

const TRIPLE_BANNER_PICTURE_NOTICE_OVERRIDES = new Map<string, string>([
  ["/images/banners/Banner/Banner_1304.webp", "/images/banners/Picture_Notice/Picture_Notice_1304.webp"],
  ["/images/banners/Banner/Banner_1404.webp", "/images/banners/Picture_Notice/Picture_Notice_1404.webp"],
  ["/images/banners/Banner/Banner_1704.webp", "/images/banners/Picture_Notice/Picture_Notice_1704.webp"],
  ["/images/banners/Banner/Banner_2003.webp", "/images/banners/Picture_Notice/Picture_Notice_2403.webp"],
  ["/images/banners/Banner/Banner_4203.webp", "/images/banners/Picture_Notice/Picture_Notice_4203.webp"],
  ["/images/banners/Banner/Banner_6603.webp", "/images/banners/Picture_Notice/Picture_Notice_6603.webp"],
  ["/images/banners/Banner/Banner_7103.webp", "/images/banners/Picture_Notice/Picture_Notice_7103.webp"],
  ["/images/banners/Banner/Banner_7203.webp", "/images/banners/Picture_Notice/Picture_Notice_7203.webp"],
  ["/images/banners/Banner/Banner_8303.webp", "/images/banners/Picture_Notice/Picture_Notice_8303.webp"],
  ["/images/banners/Banner/Banner_8403.webp", "/images/banners/Picture_Notice/Picture_Notice_8403.webp"],
  ["/images/banners/Banner/Banner_8603.webp", "/images/banners/Picture_Notice/Picture_Notice_8603.webp"],
  ["/images/banners/Banner/Banner_8703.webp", "/images/banners/Picture_Notice/Picture_Notice_8703.webp"],
  ["/images/banners/Banner/Banner_9103.webp", "/images/banners/Picture_Notice/Picture_Notice_9103.webp"],
  ["/images/banners/Banner/Banner_9303.webp", "/images/banners/Picture_Notice/Picture_Notice_9303.webp"],
  ["/images/banners/Banner/Banner_9503.webp", "/images/banners/Picture_Notice/Picture_Notice_9503.webp"],
  ["/images/banners/Banner/Banner_9603.webp", "/images/banners/Picture_Notice/Picture_Notice_9603.webp"],
  ["/images/banners/Banner/Banner_9703.webp", "/images/banners/Picture_Notice/Picture_Notice_9703.webp"],
  ["/images/banners/Banner/Banner_9803.webp", "/images/banners/Picture_Notice/Picture_Notice_9803.webp"],
  ["/images/banners/Banner/Banner_9903.webp", "/images/banners/Picture_Notice/Picture_Notice_9903.webp"],
  ["/images/banners/Banner/Banner_10003.webp", "/images/banners/Picture_Notice/Picture_Notice_10003.webp"],
  ["/images/banners/Banner/Banner_10103.webp", "/images/banners/Picture_Notice/Picture_Notice_10103.webp"],
  ["/images/banners/Banner/Banner_10203.webp", "/images/banners/Picture_Notice/Picture_Notice_10203.webp"],
  ["/images/banners/Banner/Banner_10303.webp", "/images/banners/Picture_Notice/Picture_Notice_10303.webp"],
]);

function resolveRepositoryBasePublicPath(publicPath: string | null) {
  if (!publicPath || /^(?:https?:)?\/\//i.test(publicPath)) return publicPath;
  return `${import.meta.env.BASE_URL}${publicPath.replace(/^\/+/, "")}`;
}

function resolveBannerSchedulePublicPath(publicPath: string | null) {
  if (!publicPath) return publicPath;
  const presentationPath = TRIPLE_BANNER_PICTURE_NOTICE_OVERRIDES.get(publicPath) ?? publicPath;
  return resolveRepositoryBasePublicPath(presentationPath);
}

function projectRepositoryBaseBannerPaths(data: ReturnType<typeof readBannerPageData>) {
  return {
    ...data,
    dateGroups: data.dateGroups.map((group) => ({
      ...group,
      rows: group.rows.map((row) => ({
        ...row,
        image: {
          ...row.image,
          publicPath: resolveBannerSchedulePublicPath(row.image.publicPath),
        },
      })),
    })),
    pickupLogs: data.pickupLogs.map((log) => ({
      ...log,
      appearances: log.appearances.map((appearance) => ({
        ...appearance,
        image: {
          ...appearance.image,
          publicPath: resolveRepositoryBasePublicPath(appearance.image.publicPath),
        },
      })),
    })),
  };
}

export const getBannerPageData = createServerFn({ method: "GET" }).handler(async () =>
  projectRepositoryBaseBannerPaths(readBannerPageData()),
);

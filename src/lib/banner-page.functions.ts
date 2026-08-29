import { createServerFn } from "@tanstack/react-start";

import { readBannerPageData } from "./banner-page.server";

function resolveRepositoryBasePublicPath(publicPath: string | null) {
  if (!publicPath || /^(?:https?:)?\/\//i.test(publicPath)) return publicPath;
  return `${import.meta.env.BASE_URL}${publicPath.replace(/^\/+/, "")}`;
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
          publicPath: resolveRepositoryBasePublicPath(row.image.publicPath),
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

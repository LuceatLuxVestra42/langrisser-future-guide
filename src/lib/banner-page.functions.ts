import { createServerFn } from "@tanstack/react-start";

import { readBannerPageData } from "./banner-page.server";

const PICTURE_NOTICE_STEM_OVERRIDES = new Map<string, string>([["2003", "2403"]]);

function resolveRepositoryBasePublicPath(publicPath: string | null) {
  if (!publicPath || /^(?:https?:)?\/\//i.test(publicPath)) return publicPath;
  return `${import.meta.env.BASE_URL}${publicPath.replace(/^\/+/, "")}`;
}

function resolvePictureNoticePresentationPath(
  publicPath: string | null,
  usePictureNotice: boolean,
) {
  if (!publicPath || !usePictureNotice) return publicPath;

  const match = publicPath.match(/^\/images\/banners\/Banner\/Banner_([^/]+)\.webp$/);
  if (!match) return publicPath;

  const sourceStem = match[1];
  if (!sourceStem) return publicPath;
  const pictureNoticeStem = PICTURE_NOTICE_STEM_OVERRIDES.get(sourceStem) ?? sourceStem;
  return `/images/banners/Picture_Notice/Picture_Notice_${pictureNoticeStem}.webp`;
}

function resolveBannerSchedulePublicPath(
  publicPath: string | null,
  typeLabelKr: string,
  lifecycleLabelKr: string,
) {
  const presentationPath = resolvePictureNoticePresentationPath(
    publicPath,
    typeLabelKr === "3인 픽업" || lifecycleLabelKr === "신규",
  );
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
          publicPath: resolveBannerSchedulePublicPath(
            row.image.publicPath,
            row.typeLabelKr,
            row.lifecycleLabelKr,
          ),
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

import { readBannerPageData } from "./banner-page.static";

// Static fixture used to verify /banners prerendering under the GitHub Pages project base path.
export function getBannerPageData() {
  return readBannerPageData();
}

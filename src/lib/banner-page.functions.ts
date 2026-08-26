import { readBannerPageData } from "./banner-page.static";

// Static fixture used to verify /banners prerendering for GitHub Pages.
export function getBannerPageData() {
  return readBannerPageData();
}

import { readBannerPageData } from "./banner-page.static";

// Static fixture used to verify /banners prerendering for GitHub Pages without Nitro.
export function getBannerPageData() {
  return readBannerPageData();
}

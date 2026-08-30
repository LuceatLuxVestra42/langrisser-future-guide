import { readHeroCardIconIndex } from "./hero-card-icon-assets.server";

// GitHub Pages static build: consume the frozen Hero card-icon index directly.
// Do not introduce a runtime server-function dependency for client-side route navigation.
export function getStaticHeroCardIconIndex() {
  return readHeroCardIconIndex();
}

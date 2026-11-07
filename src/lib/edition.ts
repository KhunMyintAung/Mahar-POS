export type AppEdition = "FULL" | "PLAY";

/** The cookie the Play Store app sets: it opens /play-app, which marks the phone's browser as
 *  the store build; /full-app (the web app's start address) clears it again. */
export const EDITION_COOKIE = "wn_edition";

/** The store build differs from the web build in what it may show — a Play Store build
 *  must not solicit donations — so the edition is still a thing the app knows about.
 *  APP_EDITION=PLAY makes a whole server the store build; otherwise the cookie decides. */
export function appEdition(cookie?: string): AppEdition {
  return process.env.APP_EDITION === "PLAY" || cookie === "play" ? "PLAY" : "FULL";
}

export function isPlayEdition(cookie?: string): boolean {
  return appEdition(cookie) === "PLAY";
}

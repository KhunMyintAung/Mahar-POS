export type AppEdition = "FULL" | "PLAY";

/** The store build differs from the web build in what it may show — a Play Store build
 *  must not solicit donations — so the edition is still a thing the app knows about. */
export function appEdition(): AppEdition {
  return process.env.APP_EDITION === "PLAY" ? "PLAY" : "FULL";
}

export function isPlayEdition(): boolean {
  return appEdition() === "PLAY";
}

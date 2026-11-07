// Modules the device build (scripts/build-device.mjs) generates.
declare module "device:routes" {
  export const routes: { path: string; mod: Record<string, unknown> }[];
}
declare module "device:migrations" {
  export const migrations: { name: string; sql: string }[];
}

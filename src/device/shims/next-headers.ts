// next/headers for the device engine: one request at a time, whose cookies and headers the
// engine sets before calling the route (see src/device/engine.ts).

export const deviceRequest: { cookies: Map<string, string>; headers: Headers } = {
  cookies: new Map(),
  headers: new Headers(),
};

export async function cookies() {
  return {
    get(name: string) {
      const value = deviceRequest.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll() {
      return [...deviceRequest.cookies].map(([name, value]) => ({ name, value }));
    },
    has(name: string) {
      return deviceRequest.cookies.has(name);
    },
    set() {},
    delete() {},
  };
}

export async function headers() {
  return deviceRequest.headers;
}

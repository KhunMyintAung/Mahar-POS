import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodType } from "zod";
import { getAuthUser, can, AuthUser } from "./auth";
import type { Permission } from "./permissions";
import { MoneyError } from "./money";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** JSON.stringify replacer: BigInt minor units are serialized as decimal strings. */
function replacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function json(data: unknown, init?: { status?: number }) {
  return new NextResponse(JSON.stringify({ ok: true, data }, replacer), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

export function errorJson(status: number, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

type Handler = (ctx: {
  req: NextRequest;
  user: AuthUser;
  params: Record<string, string>;
}) => Promise<NextResponse>;

/** Wrap a route handler with auth, permission check, and error handling. */
export function withAuth(perm: Permission | null, handler: Handler) {
  return async (
    req: NextRequest,
    props: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      const user = await getAuthUser();
      if (!user) return errorJson(401, "Not signed in");
      if (perm && !can(user, perm)) {
        return errorJson(403, "You do not have permission to perform this action");
      }
      const params = props?.params ? await props.params : {};
      return await handler({ req, user, params });
    } catch (e) {
      return handleError(e);
    }
  };
}

export function handleError(e: unknown): NextResponse {
  if (e instanceof ApiError) return errorJson(e.status, e.message);
  if (e instanceof ZodError) {
    return errorJson(422, "Validation failed", e.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  if (e instanceof MoneyError) return errorJson(422, e.message);
  console.error("[api]", e);
  return errorJson(500, "Something went wrong. Please try again.");
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
  return schema.parse(body);
}

/** Standard pagination params from query string. */
export function pagination(req: NextRequest, defaultSize = 25) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1") || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(sp.get("pageSize") ?? String(defaultSize)) || defaultSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

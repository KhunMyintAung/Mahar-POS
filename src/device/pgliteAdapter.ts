// Prisma driver adapter for PGlite (Postgres in the browser), for the device engine. Follows
// Prisma's own Postgres adapter (@prisma/adapter-pg 6.19): the same arguments, column types,
// value formats and error kinds, so the server code behaves the same (e.g. P2002 on a
// duplicate). Transactions use PGlite's own (one connection: Prisma's "phantom" BEGIN/COMMIT).
import { PGlite, type Transaction as PGliteTx } from "@electric-sql/pglite";
import {
  ColumnTypeEnum,
  DriverAdapterError,
  type ArgType,
  type ColumnType,
  type IsolationLevel,
  type SqlDriverAdapter,
  type SqlDriverAdapterFactory,
  type SqlQuery,
  type SqlResultSet,
  type Transaction,
  type TransactionOptions,
} from "@prisma/driver-adapter-utils";
import { parse as parseArray } from "postgres-array";

type Client = PGlite | PGliteTx;
type Field = { name: string; dataTypeID: number };

const ADAPTER = "mahar-pglite";

// Postgres type ids.
const T = {
  BOOL: 16, BYTEA: 17, CHAR: 18, NAME: 19, INT8: 20, INT2: 21, INT4: 23, TEXT: 25, OID: 26, JSON: 114,
  XML: 142, FLOAT4: 700, FLOAT8: 701, MONEY: 790, INET: 869, CIDR: 650, BPCHAR: 1042, VARCHAR: 1043,
  DATE: 1082, TIME: 1083, TIMESTAMP: 1114, TIMESTAMPTZ: 1184, TIMETZ: 1266, BIT: 1560, VARBIT: 1562,
  NUMERIC: 1700, UUID: 2950, JSONB: 3802,
  BOOL_ARRAY: 1000, BYTEA_ARRAY: 1001, CHAR_ARRAY: 1002, INT2_ARRAY: 1005, INT4_ARRAY: 1007,
  TEXT_ARRAY: 1009, BPCHAR_ARRAY: 1014, VARCHAR_ARRAY: 1015, INT8_ARRAY: 1016, FLOAT4_ARRAY: 1021,
  FLOAT8_ARRAY: 1022, OID_ARRAY: 1028, INET_ARRAY: 1041, TIMESTAMP_ARRAY: 1115, DATE_ARRAY: 1182,
  TIME_ARRAY: 1183, TIMESTAMPTZ_ARRAY: 1185, NUMERIC_ARRAY: 1231, UUID_ARRAY: 2951, JSON_ARRAY: 199,
  JSONB_ARRAY: 3807, MONEY_ARRAY: 791, CIDR_ARRAY: 651, BIT_ARRAY: 1561, VARBIT_ARRAY: 1563, XML_ARRAY: 143,
};
const FIRST_NORMAL_OBJECT_ID = 16384;

function columnType(id: number): ColumnType {
  switch (id) {
    case T.INT2: case T.INT4: return ColumnTypeEnum.Int32;
    case T.INT8: case T.OID: return ColumnTypeEnum.Int64;
    case T.FLOAT4: return ColumnTypeEnum.Float;
    case T.FLOAT8: return ColumnTypeEnum.Double;
    case T.BOOL: return ColumnTypeEnum.Boolean;
    case T.DATE: return ColumnTypeEnum.Date;
    case T.TIME: case T.TIMETZ: return ColumnTypeEnum.Time;
    case T.TIMESTAMP: case T.TIMESTAMPTZ: return ColumnTypeEnum.DateTime;
    case T.NUMERIC: case T.MONEY: return ColumnTypeEnum.Numeric;
    case T.JSON: case T.JSONB: return ColumnTypeEnum.Json;
    case T.UUID: return ColumnTypeEnum.Uuid;
    case T.BPCHAR: case T.TEXT: case T.VARCHAR: case T.BIT: case T.VARBIT: case T.INET: case T.CIDR: case T.XML: case T.NAME: case T.CHAR:
      return ColumnTypeEnum.Text;
    case T.BYTEA: return ColumnTypeEnum.Bytes;
    case T.INT2_ARRAY: case T.INT4_ARRAY: return ColumnTypeEnum.Int32Array;
    case T.FLOAT4_ARRAY: return ColumnTypeEnum.FloatArray;
    case T.FLOAT8_ARRAY: return ColumnTypeEnum.DoubleArray;
    case T.NUMERIC_ARRAY: case T.MONEY_ARRAY: return ColumnTypeEnum.NumericArray;
    case T.BOOL_ARRAY: return ColumnTypeEnum.BooleanArray;
    case T.CHAR_ARRAY: return ColumnTypeEnum.CharacterArray;
    case T.BPCHAR_ARRAY: case T.TEXT_ARRAY: case T.VARCHAR_ARRAY: case T.VARBIT_ARRAY: case T.BIT_ARRAY:
    case T.INET_ARRAY: case T.CIDR_ARRAY: case T.XML_ARRAY:
      return ColumnTypeEnum.TextArray;
    case T.DATE_ARRAY: return ColumnTypeEnum.DateArray;
    case T.TIME_ARRAY: return ColumnTypeEnum.TimeArray;
    case T.TIMESTAMP_ARRAY: case T.TIMESTAMPTZ_ARRAY: return ColumnTypeEnum.DateTimeArray;
    case T.JSON_ARRAY: case T.JSONB_ARRAY: return ColumnTypeEnum.JsonArray;
    case T.BYTEA_ARRAY: return ColumnTypeEnum.BytesArray;
    case T.UUID_ARRAY: return ColumnTypeEnum.UuidArray;
    case T.INT8_ARRAY: case T.OID_ARRAY: return ColumnTypeEnum.Int64Array;
    default:
      if (id >= FIRST_NORMAL_OBJECT_ID) return ColumnTypeEnum.Text; // enums
      throw new DriverAdapterError({ kind: "UnsupportedNativeDataType", type: String(id) });
  }
}

// Values come back as Postgres sends them (text), in the forms Prisma expects.
const same = (v: string) => v;
const array = (each: (v: string) => unknown) => (v: string) => parseArray(v, each);
const timestamp = (v: string) => `${v.replace(" ", "T")}+00:00`;
const timestamptz = (v: string) => v.replace(" ", "T").replace(/[+-]\d{2}(:\d{2})?$/, "+00:00");
const timetz = (v: string) => v.replace(/[+-]\d{2}(:\d{2})?$/, "");
const money = (v: string) => v.slice(1);
const bytes = (v: string) => {
  const hex = v.slice(2);
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
};
const parsers: Record<number, (v: string) => unknown> = {
  [T.INT8]: same, [T.INT8_ARRAY]: array(same), [T.OID]: same,
  [T.NUMERIC]: same, [T.NUMERIC_ARRAY]: array(same),
  [T.TIME]: same, [T.TIME_ARRAY]: array(same), [T.TIMETZ]: timetz,
  [T.DATE]: same, [T.DATE_ARRAY]: array(same),
  [T.TIMESTAMP]: timestamp, [T.TIMESTAMP_ARRAY]: array(timestamp),
  [T.TIMESTAMPTZ]: timestamptz, [T.TIMESTAMPTZ_ARRAY]: array(timestamptz),
  [T.MONEY]: money, [T.MONEY_ARRAY]: array(money),
  [T.JSON]: same, [T.JSON_ARRAY]: array(same), [T.JSONB]: same, [T.JSONB_ARRAY]: array(same),
  [T.BYTEA]: bytes, [T.BYTEA_ARRAY]: array(bytes),
  [T.BIT_ARRAY]: array(same), [T.VARBIT_ARRAY]: array(same), [T.XML_ARRAY]: array(same),
};

const pad = (n: number, z = 2) => String(n).padStart(z, "0");
function formatDateTime(d: Date) {
  const ms = d.getUTCMilliseconds();
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${ms ? "." + pad(ms, 3) : ""}`;
}
function formatDate(d: Date) {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function formatTime(d: Date) {
  const ms = d.getUTCMilliseconds();
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${ms ? "." + pad(ms, 3) : ""}`;
}

function base64ToBytes(v: string) {
  const s = atob(v);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function mapArg(arg: unknown, type: ArgType | undefined): unknown {
  if (arg === null || arg === undefined) return null;
  if (Array.isArray(arg) && type?.arity === "list") return arg.map((v) => mapArg(v, type));
  if (typeof arg === "string" && type?.scalarType === "datetime") arg = new Date(arg);
  if (arg instanceof Date) {
    if (type?.dbType === "TIME" || type?.dbType === "TIMETZ") return formatTime(arg);
    if (type?.dbType === "DATE") return formatDate(arg);
    return formatDateTime(arg);
  }
  if (typeof arg === "string" && type?.scalarType === "bytes") return base64ToBytes(arg);
  if (Array.isArray(arg) && type?.scalarType === "bytes") return Uint8Array.from(arg as number[]);
  if (typeof arg === "bigint") return arg.toString();
  return arg;
}

type PgError = { code?: string; message: string; severity?: string; detail?: string; column?: string; hint?: string; constraint?: string };

function convertError(e: PgError) {
  const fields = () => e.detail?.match(/Key \(([^)]+)\)/)?.at(1)?.split(", ");
  const base = { originalCode: e.code, originalMessage: e.message };
  switch (e.code) {
    case "22001": return { ...base, kind: "LengthMismatch" as const, column: e.column };
    case "22003": return { ...base, kind: "ValueOutOfRange" as const, cause: e.message };
    case "23505": { const f = fields(); return { ...base, kind: "UniqueConstraintViolation" as const, constraint: f ? { fields: f } : undefined }; }
    case "23502": { const f = fields(); return { ...base, kind: "NullConstraintViolation" as const, constraint: f ? { fields: f } : undefined }; }
    case "23503":
      return { ...base, kind: "ForeignKeyConstraintViolation" as const, constraint: e.column ? { fields: [e.column] } : e.constraint ? { index: e.constraint } : undefined };
    case "40001": return { ...base, kind: "TransactionWriteConflict" as const };
    case "42P01": return { ...base, kind: "TableDoesNotExist" as const, table: e.message.split(" ").at(1)?.split('"').at(1) };
    case "42703": return { ...base, kind: "ColumnNotFound" as const, column: e.message.split(" ").at(1)?.split('"').at(1) };
    default:
      return { ...base, kind: "postgres" as const, code: e.code ?? "N/A", severity: e.severity ?? "N/A", message: e.message, detail: e.detail, column: e.column, hint: e.hint };
  }
}

function fail(error: unknown): never {
  const e = error as PgError;
  if (e && typeof e.code === "string" && typeof e.message === "string") {
    throw new DriverAdapterError(convertError(e) as ConstructorParameters<typeof DriverAdapterError>[0]);
  }
  throw error;
}

class Queryable {
  readonly provider = "postgres" as const;
  readonly adapterName = ADAPTER;
  constructor(protected client: Client) {}

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    const { fields, rows } = await this.run(query);
    return {
      columnNames: fields.map((f) => f.name),
      columnTypes: fields.map((f) => columnType(f.dataTypeID)),
      rows: rows as SqlResultSet["rows"],
    };
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    return (await this.run(query)).affectedRows ?? 0;
  }

  protected async run(query: SqlQuery): Promise<{ fields: Field[]; rows: unknown[][]; affectedRows?: number }> {
    const values = query.args.map((arg, i) => mapArg(arg, query.argTypes[i]));
    try {
      return (await this.client.query(query.sql, values, { rowMode: "array", parsers })) as {
        fields: Field[]; rows: unknown[][]; affectedRows?: number;
      };
    } catch (error) {
      fail(error);
    }
  }
}

class PGliteTransaction extends Queryable implements Transaction {
  readonly options: TransactionOptions = { usePhantomQuery: true };
  constructor(client: PGliteTx, private finish: () => void, private done: Promise<unknown>) {
    super(client);
  }
  async commit() {
    this.finish();
    await this.done;
  }
  async rollback() {
    await (this.client as PGliteTx).rollback().catch(() => {});
    this.finish();
    await this.done.catch(() => {});
  }
}

class PGliteAdapter extends Queryable implements SqlDriverAdapter {
  constructor(private db: PGlite) {
    super(db);
  }

  async executeScript(script: string) {
    try { await this.db.exec(script); } catch (error) { fail(error); }
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<Transaction> {
    return new Promise<Transaction>((resolve, reject) => {
      let finish!: () => void;
      const held = new Promise<void>((r) => { finish = r; });
      const done = this.db.transaction(async (tx) => {
        if (isolationLevel) await tx.exec(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
        resolve(new PGliteTransaction(tx, finish, done));
        await held;
      });
      done.catch((error) => { reject(error); });
    });
  }

  getConnectionInfo() {
    return { supportsRelationJoins: true };
  }

  async dispose() {}
}

export class PrismaPGlite implements SqlDriverAdapterFactory {
  readonly provider = "postgres" as const;
  readonly adapterName = ADAPTER;
  constructor(private db: PGlite) {}
  async connect(): Promise<SqlDriverAdapter> {
    return new PGliteAdapter(this.db);
  }
}

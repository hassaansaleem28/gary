import { FalkorDB } from "falkordb";

type Graph = ReturnType<FalkorDB["selectGraph"]>;
export type Params = Record<string, unknown>;

export interface QueryLog {
  label: string;
  cypher: string;
  params: Params;
  ms: number;
  rows: number;
}

const g = globalThis as unknown as { __falkor?: Promise<FalkorDB> };

function connect(): Promise<FalkorDB> {
  if (!g.__falkor) {
    g.__falkor = FalkorDB.connect({ url: process.env.FALKORDB_URL ?? "falkor://localhost:6379" }).catch((err) => {
      g.__falkor = undefined;
      throw err;
    });
  }
  return g.__falkor;
}

export const GRAPH_NAME = process.env.GRAPH_NAME ?? "kitestring";

export async function graph(name = GRAPH_NAME): Promise<Graph> {
  return (await connect()).selectGraph(name);
}

export async function closeDb() {
  if (g.__falkor) {
    const db = await g.__falkor;
    g.__falkor = undefined;
    await db.close();
  }
}

// Every query the agent runs goes through here so the UI can show the exact Cypher, params and timing.
export class Tracer {
  logs: QueryLog[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async ro<T = Record<string, any>>(label: string, cypher: string, params: Params = {}): Promise<T[]> {
    return this.run<T>(label, cypher, params, true);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async rw<T = Record<string, any>>(label: string, cypher: string, params: Params = {}): Promise<T[]> {
    return this.run<T>(label, cypher, params, false);
  }

  private async run<T>(label: string, cypher: string, params: Params, readOnly: boolean): Promise<T[]> {
    const gr = await graph();
    const t0 = performance.now();
    const opts = { params: params as never };
    const res = readOnly ? await gr.roQuery<T>(cypher, opts) : await gr.query<T>(cypher, opts);
    const rows = res.data ?? [];
    this.logs.push({ label, cypher: dedent(cypher), params, ms: +(performance.now() - t0).toFixed(1), rows: rows.length });
    return rows;
  }
}

function dedent(s: string) {
  const lines = s.replace(/^\n+|\s+$/g, "").split("\n");
  const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines.map((l) => l.slice(pad)).join("\n");
}

// Minimal in-memory Postgrest-style supabase client mock for handler integration tests.
// Supports: from(table).select/insert/update/delete with .eq/.not/.order/.limit/.single/.maybeSingle,
// thenable so `await` works at any stage. Plus storage upload/getPublicUrl and rpc().
//
// Not a faithful re-implementation — just enough surface for whatsapp-webhook handler.

type Row = Record<string, any>
type Tables = Record<string, Row[]>

type Filter =
  | { kind: 'eq'; col: string; val: any }
  | { kind: 'neq'; col: string; val: any }
  | { kind: 'in'; col: string; vals: any[] }
  | { kind: 'gte'; col: string; val: any }
  | { kind: 'lte'; col: string; val: any }
  | { kind: 'gt'; col: string; val: any }
  | { kind: 'lt'; col: string; val: any }
  | { kind: 'is'; col: string; val: any }
  | { kind: 'match'; obj: Record<string, any> }

interface BuilderState {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  filters: Filter[]
  orderBy?: { col: string; ascending: boolean }
  limit?: number
  single?: boolean
  maybeSingle?: boolean
  payload?: Row | Row[]
  selectCols?: string
  returning: boolean
}

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((r) => filters.every((f) => {
    if (f.kind === 'eq') return r[f.col] === f.val
    if (f.kind === 'neq') return r[f.col] !== f.val
    if (f.kind === 'in') return f.vals.includes(r[f.col])
    if (f.kind === 'gte') return r[f.col] >= f.val
    if (f.kind === 'lte') return r[f.col] <= f.val
    if (f.kind === 'gt') return r[f.col] > f.val
    if (f.kind === 'lt') return r[f.col] < f.val
    if (f.kind === 'is') return r[f.col] === f.val
    if (f.kind === 'match') return Object.entries(f.obj).every(([k, v]) => r[k] === v)
    return true
  }))
}

let idCounter = 1
function genId(): string {
  return `mock-${idCounter++}`
}

function execute(tables: Tables, state: BuilderState): { data: any; error: any } {
  const list = tables[state.table] ||= []

  if (state.op === 'select') {
    let rows = applyFilters(list, state.filters)
    if (state.orderBy) {
      const { col, ascending } = state.orderBy
      rows = [...rows].sort((a, b) => {
        const av = a[col], bv = b[col]
        if (av === bv) return 0
        return (av > bv ? 1 : -1) * (ascending ? 1 : -1)
      })
    }
    if (state.limit !== undefined) rows = rows.slice(0, state.limit)
    if (state.single) {
      if (rows.length === 0) return { data: null, error: { code: 'PGRST116', message: 'no rows' } }
      if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } }
      return { data: rows[0], error: null }
    }
    if (state.maybeSingle) return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null }
  }

  if (state.op === 'insert') {
    const payloads = Array.isArray(state.payload) ? state.payload : [state.payload!]
    const inserted: Row[] = []
    for (const p of payloads) {
      const row = { id: p.id ?? genId(), created_at: new Date().toISOString(), ...p }
      // Unique constraint stub for message_dedup
      if (state.table === 'message_dedup' && list.some((r) => r.message_id === row.message_id)) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } }
      }
      list.push(row)
      inserted.push(row)
    }
    if (!state.returning) return { data: null, error: null }
    if (state.single) return { data: inserted[0], error: null }
    return { data: inserted, error: null }
  }

  if (state.op === 'update') {
    const target = applyFilters(list, state.filters)
    for (const row of target) Object.assign(row, state.payload as Row)
    if (!state.returning) return { data: null, error: null }
    if (state.single) return { data: target[0] ?? null, error: null }
    return { data: target, error: null }
  }

  if (state.op === 'delete') {
    const keep: Row[] = []
    const removed: Row[] = []
    for (const r of list) {
      if (applyFilters([r], state.filters).length > 0) removed.push(r)
      else keep.push(r)
    }
    tables[state.table] = keep
    return { data: removed, error: null }
  }

  return { data: null, error: { message: 'unknown op' } }
}

function makeBuilder(tables: Tables, state: BuilderState): any {
  const builder: any = {
    select(cols?: string) { state.selectCols = cols; state.returning = true; return builder },
    insert(payload: Row | Row[]) { state.op = 'insert'; state.payload = payload; state.returning = false; return builder },
    update(payload: Row) { state.op = 'update'; state.payload = payload; state.returning = false; return builder },
    delete() { state.op = 'delete'; state.returning = false; return builder },
    eq(col: string, val: any) { state.filters.push({ kind: 'eq', col, val }); return builder },
    neq(col: string, val: any) { state.filters.push({ kind: 'neq', col, val }); return builder },
    gte(col: string, val: any) { state.filters.push({ kind: 'gte', col, val }); return builder },
    lte(col: string, val: any) { state.filters.push({ kind: 'lte', col, val }); return builder },
    gt(col: string, val: any) { state.filters.push({ kind: 'gt', col, val }); return builder },
    lt(col: string, val: any) { state.filters.push({ kind: 'lt', col, val }); return builder },
    is(col: string, val: any) { state.filters.push({ kind: 'is', col, val }); return builder },
    match(obj: Record<string, any>) { state.filters.push({ kind: 'match', obj }); return builder },
    filter(col: string, op: string, val: any) {
      if (op === 'eq') state.filters.push({ kind: 'eq', col, val })
      else if (op === 'neq') state.filters.push({ kind: 'neq', col, val })
      else if (op === 'gte') state.filters.push({ kind: 'gte', col, val })
      else if (op === 'lte') state.filters.push({ kind: 'lte', col, val })
      else if (op === 'gt') state.filters.push({ kind: 'gt', col, val })
      else if (op === 'lt') state.filters.push({ kind: 'lt', col, val })
      return builder
    },
    or(_expr: string) { return builder },
    upsert(payload: Row | Row[]) { state.op = 'insert'; state.payload = payload; state.returning = false; return builder },
    in(col: string, vals: any[]) { state.filters.push({ kind: 'in', col, vals }); return builder },
    not(col: string, op: string, val: any) {
      if (op === 'eq') state.filters.push({ kind: 'neq', col, val })
      return builder
    },
    order(col: string, opts?: { ascending?: boolean }) { state.orderBy = { col, ascending: opts?.ascending !== false }; return builder },
    limit(n: number) { state.limit = n; return builder },
    single() { state.single = true; return builder },
    maybeSingle() { state.maybeSingle = true; return builder },
    then(onFulfilled: any, onRejected: any) {
      try {
        const res = execute(tables, state)
        return Promise.resolve(res).then(onFulfilled, onRejected)
      } catch (e) {
        return Promise.reject(e).then(onFulfilled, onRejected)
      }
    },
    catch(onRejected: any) { return builder.then(undefined, onRejected) },
  }
  return builder
}

export interface MockSupabase {
  tables: Tables
  rpcCalls: Array<{ name: string; args: any }>
  storageUploads: Array<{ bucket: string; path: string; size: number }>
  client: any
}

export function createMockSupabase(initial: Partial<Tables> = {}): MockSupabase {
  const tables: Tables = {}
  for (const [k, v] of Object.entries(initial)) tables[k] = [...(v as Row[])]
  const rpcCalls: Array<{ name: string; args: any }> = []
  const storageUploads: Array<{ bucket: string; path: string; size: number }> = []

  const client = {
    from(table: string) {
      return makeBuilder(tables, {
        table, op: 'select', filters: [], returning: true,
      })
    },
    rpc(name: string, args?: any) {
      rpcCalls.push({ name, args })
      const thenable = {
        then: (onF: any, onR: any) => Promise.resolve({ data: null, error: null }).then(onF, onR),
        catch: (onR: any) => Promise.resolve({ data: null, error: null }).catch(onR),
      }
      return thenable
    },
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, body: ArrayBuffer | Blob, _opts?: any) {
            const size = body instanceof ArrayBuffer ? body.byteLength : (body as Blob).size
            storageUploads.push({ bucket, path, size })
            return { data: { path }, error: null }
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://mock-storage/${bucket}/${path}` } }
          },
        }
      },
    },
  }

  return { tables, rpcCalls, storageUploads, client }
}

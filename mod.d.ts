// Minimal ambient types to avoid external type imports in Deno
type Pool = any;
type fssh = any;
type EventEmitter = any;

export interface DBConfig {
  host: string;
  port?: number;
  user: string;
  pass: string;
  db: string;
  stream?: any;
  initialQueries?: string[];
}

export interface SshConfig {
  host: string;
  port: number;
  user: string;
  privateKeyPath: string;
  localPort?: number;
}

export type TResult = Array<string[] | any[]> | any;
export type TRow = Record<string, any>;
export type TCell = any;

export default class DB {
  pool: Pool;
  ssh?: fssh;
  queryStack: any[];
  creationPromise: Promise<any>;
  ee?: EventEmitter;
  isQueryRunning: boolean;

  constructor(config: DBConfig | string, sshConfig?: SshConfig);
  create(config: DBConfig, sshConfig?: SshConfig): Promise<any>;
  end(): void;
  static screen(l: any): string;
  escape(q: string | null | undefined, quote?: boolean, addPerc?: boolean): string;
  connect(config: DBConfig): Promise<Pool>;

  select(sql: string, ...values: any[]): Promise<any>;
  col(sql: string, ...values: any[]): Promise<TCell[]>;
  cell(sql: string, ...values: any[]): Promise<TCell>;
  q(sql: string, ...values: any[]): Promise<any>;
  row(sql: string, ...values: any[]): Promise<TRow>;
  query(sql: string, ...values: any[]): Promise<any>;

  protected doQueryStack(): void;
  protected doQuery(sql: string, values: any[]): Promise<any>;
}

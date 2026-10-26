/** A unit of seed data. Business modules register their seeders under SEEDERS. */
export interface Seeder {
  readonly name: string;
  run(): Promise<void>;
}

export const SEEDERS = Symbol('Seeders');

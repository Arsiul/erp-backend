import type { Response, Test } from 'supertest';
import { API, bodyOf, type E2eContext } from '../e2e-context';

export interface ErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
}

/** Waits for the response and fails with its body when the status is not the expected one. */
export async function expectStatus(test: Test, status: number): Promise<Response> {
  const response = await test;
  if (response.status !== status) {
    throw new Error(
      `Se esperaba ${String(status)} y llegó ${String(response.status)}: ${JSON.stringify(response.body)}`,
    );
  }
  return response;
}

/** Returns the row the predicate selects and fails with a readable message when there is none. */
export function pick<T>(rows: readonly T[], predicate: (row: T) => boolean, what: string): T {
  const row = rows.find(predicate);
  if (row === undefined) {
    throw new Error(`No se encontró ${what}.`);
  }
  return row;
}

/** Calls the API as one signed-in user. */
export class ApiClient {
  constructor(
    private readonly ctx: E2eContext,
    readonly token: string,
  ) {}

  get(path: string): Test {
    return this.ctx.http.get(`${API}${path}`).set('Authorization', `Bearer ${this.token}`);
  }

  post(path: string, body: object = {}): Test {
    return this.ctx.http
      .post(`${API}${path}`)
      .set('Authorization', `Bearer ${this.token}`)
      .send(body);
  }

  patch(path: string, body: object): Test {
    return this.ctx.http
      .patch(`${API}${path}`)
      .set('Authorization', `Bearer ${this.token}`)
      .send(body);
  }

  delete(path: string): Test {
    return this.ctx.http.delete(`${API}${path}`).set('Authorization', `Bearer ${this.token}`);
  }

  async create<T>(resource: string, body: object): Promise<T> {
    return bodyOf<T>(await expectStatus(this.post(`/${resource}`, body), 201));
  }

  async act<T>(resource: string, id: string, action: string): Promise<T> {
    return bodyOf<T>(await expectStatus(this.post(`/${resource}/${id}/${action}`), 200));
  }

  async one<T>(resource: string, id: string): Promise<T> {
    return bodyOf<T>(await expectStatus(this.get(`/${resource}/${id}`), 200));
  }

  async list<T>(path: string): Promise<T[]> {
    return bodyOf<T[]>(await expectStatus(this.get(path), 200));
  }

  /** Sends a request that must be rejected and returns the error body. */
  async rejected(test: Test, status = 422): Promise<ErrorBody> {
    return bodyOf<ErrorBody>(await expectStatus(test, status));
  }
}

import type { Submission } from "./types.js";

export type SubmissionIdempotencyRecord = {
  ownerUserId: string;
  key: string;
  fingerprint: string;
  submissionId: string;
  mediaLinkId?: string;
  response: Submission;
};

export interface SubmissionRepository {
  transaction<T>(operation: (repository: SubmissionRepository) => Promise<T>): Promise<T>;
  insert(submission: Submission): Promise<void>;
  findById(id: string): Promise<Submission | null>;
  findByReceiptNo(receiptNo: string): Promise<Submission | null>;
  listByOwner(ownerUserId: string): Promise<Submission[]>;
  update(submission: Submission): Promise<void>;
  findIdempotency(ownerUserId: string, key: string): Promise<SubmissionIdempotencyRecord | null>;
  saveIdempotency(record: SubmissionIdempotencyRecord): Promise<void>;
}

export class InMemorySubmissionRepository implements SubmissionRepository {
  readonly submissions = new Map<string, Submission>();
  readonly idempotency = new Map<string, SubmissionIdempotencyRecord>();
  private pending: Promise<void> = Promise.resolve();

  // 本地单进程事务：串行校验并写入副本，成功后一次发布，失败时丢弃。
  // PostgreSQL 适配器必须使用同一数据库事务与行锁，不能用此锁替代。
  async transaction<T>(operation: (repository: SubmissionRepository) => Promise<T>): Promise<T> {
    const previous = this.pending;
    let release!: () => void;
    this.pending = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const transaction = new InMemorySubmissionRepository();
      for (const [id, value] of this.submissions) transaction.submissions.set(id, structuredClone(value));
      for (const [key, value] of this.idempotency) transaction.idempotency.set(key, structuredClone(value));
      const result = await operation(transaction);
      this.submissions.clear();
      this.idempotency.clear();
      for (const [id, value] of transaction.submissions) this.submissions.set(id, value);
      for (const [key, value] of transaction.idempotency) this.idempotency.set(key, value);
      return result;
    } finally {
      release();
    }
  }

  async insert(submission: Submission): Promise<void> {
    this.submissions.set(submission.id, cloneSubmission(submission));
  }

  async findById(id: string): Promise<Submission | null> {
    const submission = this.submissions.get(id);
    return submission ? cloneSubmission(submission) : null;
  }

  async findByReceiptNo(receiptNo: string): Promise<Submission | null> {
    const submission = [...this.submissions.values()].find((item) => item.receiptNo === receiptNo);
    return submission ? cloneSubmission(submission) : null;
  }

  async listByOwner(ownerUserId: string): Promise<Submission[]> {
    return [...this.submissions.values()].filter((submission) => submission.ownerUserId === ownerUserId).sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()).map(cloneSubmission);
  }

  async update(submission: Submission): Promise<void> {
    this.submissions.set(submission.id, cloneSubmission(submission));
  }

  async findIdempotency(ownerUserId: string, key: string): Promise<SubmissionIdempotencyRecord | null> {
    const record = this.idempotency.get(idempotencyKey(ownerUserId, key));
    return record ? structuredClone(record) : null;
  }

  async saveIdempotency(record: SubmissionIdempotencyRecord): Promise<void> {
    this.idempotency.set(idempotencyKey(record.ownerUserId, record.key), structuredClone(record));
  }
}

function idempotencyKey(ownerUserId: string, key: string): string {
  return `${ownerUserId}:${key}`;
}

function cloneSubmission(submission: Submission): Submission {
  return structuredClone(submission);
}

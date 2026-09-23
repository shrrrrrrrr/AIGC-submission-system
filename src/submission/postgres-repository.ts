import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { SubmissionRepository, SubmissionIdempotencyRecord, SubmissionTransactionContext } from "./repository.js";
import type { AuditEvent } from "../auth/types.js";
import type { MediaLink, Submission, SubmissionDraft, SubmissionStatus } from "./types.js";
import { withTransaction } from "../auth/postgres-repository.js";

type SubmissionRow = QueryResultRow & {
  id: string;
  receipt_no: string;
  owner_user_id: string;
  current_status: SubmissionStatus;
  current_version_no: number;
  draft_revision: number;
  created_at: Date;
  updated_at: Date;
  version_id: string;
  title: string;
  direction: SubmissionDraft["direction"];
  work_form: SubmissionDraft["workForm"];
  synopsis: string;
  creative_statement: string;
  ai_contribution_percent: number | null;
  ai_tools: string[] | null;
  ai_workflow: string;
  human_contribution: string;
  rights_confirmed: boolean;
  ai_label_confirmed: boolean;
  template_confirmed: boolean | null;
};

type MediaLinkRow = QueryResultRow & {
  id: string;
  purpose: MediaLink["purpose"];
  original_url: string;
  canonical_url: string | null;
  provider: string | null;
  external_video_id: string | null;
  is_publicly_accessible: boolean | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  precheck_status: MediaLink["precheckStatus"];
  failure_code: string | null;
  precheck_findings: MediaLink["precheckFindings"] | null;
  checked_at: Date | null;
  expires_at: Date | null;
};

export class PostgresSubmissionRepository implements SubmissionRepository {
  constructor(private readonly pool: Pool, private readonly client: PoolClient | null = null) {}

  async transaction<T>(operation: (repository: SubmissionRepository, context?: SubmissionTransactionContext) => Promise<T>): Promise<T> {
    return withTransaction(this.pool, async (client) => operation(new PostgresSubmissionRepository(this.pool, client), { audit: (event) => insertAuditEvent(client, event) }));
  }

  async insert(submission: Submission): Promise<void> {
    await this.db().query(
      `INSERT INTO submissions (id, receipt_no, owner_user_id, current_status, current_version_no, draft_revision, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [submission.id, submission.receiptNo, submission.ownerUserId, submission.currentStatus, submission.currentVersionNo, submission.draftRevision, submission.createdAt, submission.updatedAt],
    );
    await this.insertVersion(submission);
  }

  async findById(id: string): Promise<Submission | null> {
    const result = await this.db().query<SubmissionRow>(submissionSelect + " WHERE s.id = $1", [id]);
    return result.rows[0] ? this.hydrate(result.rows[0]) : null;
  }

  async findByReceiptNo(receiptNo: string): Promise<Submission | null> {
    const result = await this.db().query<SubmissionRow>(submissionSelect + " WHERE s.receipt_no = $1", [receiptNo]);
    return result.rows[0] ? this.hydrate(result.rows[0]) : null;
  }

  async listByOwner(ownerUserId: string): Promise<Submission[]> {
    const result = await this.db().query<SubmissionRow>(submissionSelect + " WHERE s.owner_user_id = $1 ORDER BY s.updated_at DESC", [ownerUserId]);
    return Promise.all(result.rows.map((row) => this.hydrate(row)));
  }

  async listAll(): Promise<Submission[]> {
    const result = await this.db().query<SubmissionRow>(submissionSelect + " ORDER BY s.updated_at DESC");
    return Promise.all(result.rows.map((row) => this.hydrate(row)));
  }

  async update(submission: Submission): Promise<void> {
    const result = await this.db().query(
      `UPDATE submissions SET current_status = $2, current_version_no = $3, draft_revision = $4, updated_at = $5
       WHERE id = $1 AND draft_revision = $6`,
      [submission.id, submission.currentStatus, submission.currentVersionNo, submission.draftRevision, submission.updatedAt, submission.draftRevision - 1],
    );
    if (result.rowCount !== 1) throw new Error("submission draft revision conflict");
    const versionResult = await this.db().query<{ id: string }>(`SELECT id FROM submission_versions WHERE submission_id = $1 AND version_no = $2 FOR UPDATE`, [submission.id, submission.currentVersionNo]);
    const versionId = versionResult.rows[0]?.id;
    if (!versionId) throw new Error("submission version missing");
    await this.updateVersion(submission, versionId);
    // Keep link IDs stable because submission_idempotency_keys references them.
    // Updating in place preserves retry/replay records across draft saves.
    for (const link of submission.mediaLinks) {
      const linkResult = await this.db().query(
        `UPDATE media_links SET purpose = $3, original_url = $4, canonical_url = $5, provider = $6, external_video_id = $7,
           is_publicly_accessible = $8, duration_seconds = $9, width = $10, height = $11, precheck_status = $12,
           failure_code = $13, precheck_findings = $14, checked_at = $15, expires_at = $16
         WHERE id = $1 AND version_id = $2`,
        [link.id, versionId, link.purpose, link.originalUrl, link.canonicalUrl, link.provider, link.externalVideoId, link.isPubliclyAccessible, link.durationSeconds, link.width, link.height, link.precheckStatus, link.failureCode, link.precheckFindings, link.checkedAt, link.expiresAt],
      );
      if (linkResult.rowCount === 0) await this.insertMediaLink(versionId, link);
    }
  }

  async findIdempotency(ownerUserId: string, key: string): Promise<SubmissionIdempotencyRecord | null> {
    await this.db().query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${ownerUserId}:${key}`]);
    const result = await this.db().query<{ owner_user_id: string; idempotency_key: string; fingerprint: string; submission_id: string; media_link_id: string | null; response_snapshot: Submission }>(
      `SELECT owner_user_id, idempotency_key, fingerprint, submission_id, media_link_id, response_snapshot
       FROM submission_idempotency_keys WHERE owner_user_id = $1 AND idempotency_key = $2`, [ownerUserId, key]);
    const row = result.rows[0];
    if (!row) return null;
    const record: SubmissionIdempotencyRecord = { ownerUserId: row.owner_user_id, key: row.idempotency_key, fingerprint: row.fingerprint, submissionId: row.submission_id, response: deserializeSubmission(row.response_snapshot) };
    if (row.media_link_id !== null) record.mediaLinkId = row.media_link_id;
    return record;
  }

  async saveIdempotency(record: SubmissionIdempotencyRecord): Promise<void> {
    await this.db().query(
      `INSERT INTO submission_idempotency_keys (owner_user_id, idempotency_key, fingerprint, submission_id, media_link_id, response_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [record.ownerUserId, record.key, record.fingerprint, record.submissionId, record.mediaLinkId ?? null, JSON.stringify(record.response)],
    );
  }

  private async insertVersion(submission: Submission): Promise<void> {
    const result = await this.db().query<{ id: string }>(
      `INSERT INTO submission_versions (submission_id, version_no, title, direction, work_form, synopsis, creative_statement, ai_contribution_percent, ai_tools, ai_workflow, human_contribution, rights_confirmed, ai_label_confirmed, template_confirmed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [submission.id, submission.currentVersionNo, submission.draft.title, submission.draft.direction, submission.draft.workForm, submission.draft.synopsis, submission.draft.creativeStatement, submission.draft.aiContributionPercent, JSON.stringify(submission.draft.aiTools), submission.draft.aiWorkflow, submission.draft.humanContribution, submission.draft.rightsConfirmed, submission.draft.aiLabelConfirmed, submission.draft.templateConfirmed],
    );
    const versionId = result.rows[0]?.id;
    if (!versionId) throw new Error("submission version insert failed");
    for (const link of submission.mediaLinks) await this.insertMediaLink(versionId, link);
  }

  private async updateVersion(submission: Submission, versionId: string): Promise<void> {
    await this.db().query(
      `UPDATE submission_versions SET title = $2, direction = $3, work_form = $4, synopsis = $5, creative_statement = $6, ai_contribution_percent = $7, ai_tools = $8, ai_workflow = $9, human_contribution = $10, rights_confirmed = $11, ai_label_confirmed = $12, template_confirmed = $13
       WHERE id = $1`,
      [versionId, submission.draft.title, submission.draft.direction, submission.draft.workForm, submission.draft.synopsis, submission.draft.creativeStatement, submission.draft.aiContributionPercent, JSON.stringify(submission.draft.aiTools), submission.draft.aiWorkflow, submission.draft.humanContribution, submission.draft.rightsConfirmed, submission.draft.aiLabelConfirmed, submission.draft.templateConfirmed],
    );
  }

  private async insertMediaLink(versionId: string, link: MediaLink): Promise<void> {
    await this.db().query(
      `INSERT INTO media_links (id, version_id, purpose, original_url, canonical_url, provider, external_video_id, is_publicly_accessible, duration_seconds, width, height, precheck_status, failure_code, precheck_findings, checked_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [link.id, versionId, link.purpose, link.originalUrl, link.canonicalUrl, link.provider, link.externalVideoId, link.isPubliclyAccessible, link.durationSeconds, link.width, link.height, link.precheckStatus, link.failureCode, link.precheckFindings, link.checkedAt, link.expiresAt],
    );
  }

  private async hydrate(row: SubmissionRow): Promise<Submission> {
    const mediaResult = await this.db().query<MediaLinkRow>(`SELECT id, purpose, original_url, canonical_url, provider, external_video_id, is_publicly_accessible, duration_seconds, width, height, precheck_status, failure_code, precheck_findings, checked_at, expires_at FROM media_links WHERE version_id = $1 ORDER BY id`, [row.version_id]);
    return {
      id: row.id, receiptNo: row.receipt_no, ownerUserId: row.owner_user_id, currentStatus: row.current_status, currentVersionNo: row.current_version_no, draftRevision: row.draft_revision,
      draft: { title: row.title, direction: row.direction, workForm: row.work_form, synopsis: row.synopsis, creativeStatement: row.creative_statement, aiContributionPercent: row.ai_contribution_percent, aiTools: row.ai_tools ?? [], aiWorkflow: row.ai_workflow, humanContribution: row.human_contribution, rightsConfirmed: row.rights_confirmed, aiLabelConfirmed: row.ai_label_confirmed, templateConfirmed: row.template_confirmed },
      mediaLinks: mediaResult.rows.map(mapMediaLink), createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  private db(): Pool | PoolClient { return this.client ?? this.pool; }
}

const submissionSelect = `SELECT s.id, s.receipt_no, s.owner_user_id, s.current_status, s.current_version_no, s.draft_revision, s.created_at, s.updated_at, sv.id AS version_id, sv.title, sv.direction, sv.work_form, sv.synopsis, sv.creative_statement, sv.ai_contribution_percent, sv.ai_tools, sv.ai_workflow, sv.human_contribution, sv.rights_confirmed, sv.ai_label_confirmed, sv.template_confirmed FROM submissions s JOIN submission_versions sv ON sv.submission_id = s.id AND sv.version_no = s.current_version_no`;

function mapMediaLink(row: MediaLinkRow): MediaLink {
  return { id: row.id, purpose: row.purpose, originalUrl: row.original_url, canonicalUrl: row.canonical_url, provider: row.provider, externalVideoId: row.external_video_id, isPubliclyAccessible: row.is_publicly_accessible, durationSeconds: row.duration_seconds, width: row.width, height: row.height, precheckStatus: row.precheck_status, failureCode: row.failure_code, precheckFindings: row.precheck_findings ?? [], checkedAt: row.checked_at, expiresAt: row.expires_at };
}

function deserializeSubmission(input: Submission): Submission {
  return { ...input, createdAt: new Date(input.createdAt), updatedAt: new Date(input.updatedAt), mediaLinks: input.mediaLinks.map((link) => ({ ...link, checkedAt: link.checkedAt ? new Date(link.checkedAt) : null, expiresAt: link.expiresAt ? new Date(link.expiresAt) : null })) };
}

async function insertAuditEvent(client: PoolClient, event: AuditEvent): Promise<void> {
  await client.query(`INSERT INTO audit_logs (action, outcome, request_id, user_id, ip, metadata, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [event.action, event.outcome, event.requestId, event.userId ?? null, event.ip ?? null, event.metadata ?? null, event.createdAt]);
}

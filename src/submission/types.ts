export const SUBMISSION_DIRECTIONS = ["frontier_tech", "traditional_culture", "science_fiction"] as const;
export type SubmissionDirection = (typeof SUBMISSION_DIRECTIONS)[number];

export const WORK_FORMS = [
  "narrative",
  "documentary",
  "sci_fi",
  "experimental",
  "animation",
  "realtime",
  "scientific_visualization",
  "three_d",
  "vr",
  "mr",
  "other",
] as const;
export type WorkForm = (typeof WORK_FORMS)[number];

export const MEDIA_PURPOSES = ["mainWork", "makingOf", "guideVideo", "experience"] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const PRECHECK_STATUSES = ["pending", "checking", "passed", "failed"] as const;
export type PrecheckStatus = (typeof PRECHECK_STATUSES)[number];

export type PrecheckFinding = { code: string; field: string; message: string };

/**
 * Normalize JSONB values from older releases before they reach callers.
 * Historic rows may contain a serialized array or a wrapped `{ findings }`
 * object, while the current domain contract is always an array.
 */
export function normalizePrecheckFindings(value: unknown): PrecheckFinding[] {
  if (typeof value === "string") {
    try { return normalizePrecheckFindings(JSON.parse(value)); } catch { return []; }
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is PrecheckFinding => {
      if (!item || typeof item !== "object") return false;
      const finding = item as Record<string, unknown>;
      return typeof finding.code === "string" && typeof finding.field === "string" && typeof finding.message === "string";
    });
  }
  if (value && typeof value === "object") {
    const findings = (value as Record<string, unknown>).findings;
    if (findings !== undefined) return normalizePrecheckFindings(findings);
  }
  return [];
}

export const SUBMISSION_STATUSES = ["draft", "checking_links", "ready", "submitted", "needs_supplement", "qualification_pass", "reviewing", "shortlisted", "winner", "not_selected", "withdrawn", "invalid"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export type SubmissionDraft = {
  title: string;
  direction: SubmissionDirection;
  workForm: WorkForm;
  synopsis: string;
  creativeStatement: string;
  aiContributionPercent: number | null;
  aiTools: string[];
  aiWorkflow: string;
  humanContribution: string;
  rightsConfirmed: boolean;
  aiLabelConfirmed: boolean;
  templateConfirmed: boolean | null;
};

export type MediaLink = {
  id: string;
  purpose: MediaPurpose;
  originalUrl: string;
  canonicalUrl: string | null;
  provider: string | null;
  externalVideoId: string | null;
  isPubliclyAccessible: boolean | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  precheckStatus: PrecheckStatus;
  failureCode: string | null;
  precheckFindings: PrecheckFinding[];
  checkedAt: Date | null;
  expiresAt: Date | null;
};

export type Submission = {
  id: string;
  receiptNo: string;
  ownerUserId: string;
  currentStatus: SubmissionStatus;
  currentVersionNo: number;
  draftRevision: number;
  draft: SubmissionDraft;
  mediaLinks: MediaLink[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreateDraftInput = Pick<SubmissionDraft, "title" | "direction" | "workForm">;
export type DraftPatch = { [Key in keyof SubmissionDraft]?: SubmissionDraft[Key] | undefined };

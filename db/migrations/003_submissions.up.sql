CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  current_status text NOT NULL DEFAULT 'draft' CHECK (current_status IN ('draft', 'checking_links', 'ready', 'submitted', 'needs_supplement', 'qualification_pass', 'reviewing', 'shortlisted', 'winner', 'not_selected', 'withdrawn', 'invalid')),
  current_version_no integer NOT NULL DEFAULT 1 CHECK (current_version_no >= 1),
  draft_revision integer NOT NULL DEFAULT 1 CHECK (draft_revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submissions_owner_updated_idx ON submissions(owner_user_id, updated_at DESC);
CREATE INDEX submissions_status_updated_idx ON submissions(current_status, updated_at DESC);

CREATE TABLE submission_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no >= 1),
  title text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('frontier_tech', 'traditional_culture', 'science_fiction')),
  work_form text NOT NULL CHECK (work_form IN ('narrative', 'documentary', 'sci_fi', 'experimental', 'animation', 'realtime', 'scientific_visualization', 'three_d', 'vr', 'mr', 'other')),
  synopsis text NOT NULL DEFAULT '',
  creative_statement text NOT NULL DEFAULT '',
  ai_contribution_percent integer CHECK (ai_contribution_percent IS NULL OR (ai_contribution_percent BETWEEN 80 AND 100)),
  ai_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_workflow text NOT NULL DEFAULT '',
  human_contribution text NOT NULL DEFAULT '',
  rights_confirmed boolean NOT NULL DEFAULT false,
  ai_label_confirmed boolean NOT NULL DEFAULT false,
  template_confirmed boolean,
  submitted_at timestamptz,
  UNIQUE (submission_id, version_no)
);
CREATE INDEX submission_versions_submission_idx ON submission_versions(submission_id, version_no DESC);

CREATE TABLE media_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES submission_versions(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('mainWork', 'makingOf', 'guideVideo', 'experience')),
  original_url text NOT NULL,
  canonical_url text,
  provider text,
  external_video_id text,
  is_publicly_accessible boolean,
  duration_seconds integer,
  width integer,
  height integer,
  precheck_status text NOT NULL DEFAULT 'pending' CHECK (precheck_status IN ('pending', 'checking', 'passed', 'failed')),
  failure_code text,
  precheck_findings jsonb,
  checked_at timestamptz,
  expires_at timestamptz,
  UNIQUE (version_id, purpose)
);

CREATE TABLE submission_idempotency_keys (
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
  media_link_id uuid REFERENCES media_links(id) ON DELETE RESTRICT,
  response_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, idempotency_key)
);

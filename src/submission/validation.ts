import type { MediaPurpose, SubmissionDraft, WorkForm } from "./types.js";

export type SubmissionIssue = {
  field: keyof SubmissionDraft | MediaPurpose;
  step: number;
  message: string;
};

/**
 * The final-submit contract shared by the API and the UI. Drafts may remain
 * incomplete while they are being edited; this function is only used at the
 * final submission boundary.
 */
export function getSubmissionIssues(
  draft: SubmissionDraft,
  links: Partial<Record<MediaPurpose, string>>,
): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const requiredText = (field: keyof SubmissionDraft, value: unknown, step: number, message: string): void => {
    if (typeof value !== "string" || value.trim().length === 0) issues.push({ field, step, message });
  };

  requiredText("title", draft.title, 1, "请填写作品名称");
  if (!draft.direction) issues.push({ field: "direction", step: 1, message: "请选择投稿方向" });
  if (!draft.workForm) issues.push({ field: "workForm", step: 1, message: "请选择作品形式" });

  requiredText("synopsis", draft.synopsis, 2, "请填写作品简介");
  requiredText("creativeStatement", draft.creativeStatement, 2, "请填写创作说明");

  const aiPercent = draft.aiContributionPercent;
  if (!Number.isInteger(aiPercent) || (aiPercent as number) < 80 || (aiPercent as number) > 100) {
    issues.push({ field: "aiContributionPercent", step: 3, message: "AI 占比需填写 80—100 的整数" });
  }
  if (!Array.isArray(draft.aiTools) || !draft.aiTools.some((tool) => typeof tool === "string" && tool.trim().length > 0)) {
    issues.push({ field: "aiTools", step: 3, message: "请至少填写一种 AI 工具" });
  }
  requiredText("aiWorkflow", draft.aiWorkflow, 3, "请填写 AI 使用流程");
  requiredText("humanContribution", draft.humanContribution, 3, "请填写人工创作贡献");
  if (draft.rightsConfirmed !== true) issues.push({ field: "rightsConfirmed", step: 4, message: "请确认作品版权声明" });
  if (draft.aiLabelConfirmed !== true) issues.push({ field: "aiLabelConfirmed", step: 4, message: "请确认 AI 内容声明" });

  requiredLink(issues, "mainWork", links.mainWork, "请填写主体作品链接");
  requiredLink(issues, "makingOf", links.makingOf, "请填写制作解析链接");
  if (requiresGuideVideo(draft.workForm)) requiredLink(issues, "guideVideo", links.guideVideo, "当前作品形式必须填写导览视频链接");

  return issues;
}

export function requiresGuideVideo(workForm: WorkForm): boolean {
  return workForm === "vr" || workForm === "mr" || workForm === "realtime";
}

function requiredLink(issues: SubmissionIssue[], field: MediaPurpose, value: string | undefined, message: string): void {
  if (typeof value !== "string" || value.trim().length === 0) issues.push({ field, step: 5, message });
}

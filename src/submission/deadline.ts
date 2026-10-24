// 2026 年 10 月 20 日 24:00（北京时间），即次日零点。
export const SUBMISSION_DEADLINE = "2026-10-21T00:00:00+08:00";
export const SUBMISSION_CLOSED_MESSAGE = "投稿已截止，不能新建稿件、修改草稿或提交作品。已有稿件仍保留。";

export function submissionWindow(now: Date) {
  return {
    deadline: SUBMISSION_DEADLINE,
    serverNow: now.toISOString(),
    closed: now.getTime() >= Date.parse(SUBMISSION_DEADLINE),
  };
}

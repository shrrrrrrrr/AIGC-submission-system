import type { Submission } from './types.js';

export const tableStatusLabels: Record<string, string> = { draft: '草稿', checking_links: '链接检查中', ready: '待提交', submitted: '待资格审查', needs_supplement: '待补充材料', qualification_pass: '资格审查通过', reviewing: '专业初评中', shortlisted: '入围', winner: '获奖', not_selected: '未入选', withdrawn: '已撤回', invalid: '资格不通过' };
export const tableDirectionLabels: Record<string, string> = { frontier_tech: '前沿科技', traditional_culture: '传统文化', science_fiction: '科学幻想' };
const forms: Record<string, string> = { narrative: '叙事影像', documentary: '纪录影像', sci_fi: '科幻影像', experimental: '实验影像', animation: '动画', realtime: '实时作品', scientific_visualization: '科研可视化', three_d: '三维影像', vr: 'VR', mr: 'MR', other: '其他' };
export const tablePurposes = ['mainWork', 'makingOf', 'guideVideo', 'experience'] as const;
export const tableLinkLabels = ['主体作品链接', '制作解析链接', '导览视频链接', '体验链接'];
export const tableHeaders = ['提交编号', '提交时间（北京时间）', '提交者邮箱', '作品名称', '投稿方向', '作品形式', '当前状态', '版本', '更新时间（北京时间）', '作品简介', '创作说明', 'AI 贡献比例（%）', 'AI 工具', 'AI 创作流程', '人工贡献说明', '权利声明', '生成内容标识声明', '片头模板声明', ...tableLinkLabels.flatMap(label => [label, label + '核验状态'])];
export type TableFilter = { q?: string | undefined; status?: string | undefined; direction?: string | undefined };
export type TableSource = { submission: Submission; email: string };
export type TableRow = { id: string; cells: string[]; links: Array<{ id: string; purpose: string; precheckStatus: string }> };
export type TablePage = { items: TableRow[]; total: number; page: number; pageSize: number; refreshedAt: string };

export function tableDate(value: Date | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(value);
}

export function filterTableRows(rows: TableSource[], filter: TableFilter): TableSource[] {
  const q = filter.q?.trim().toLowerCase() ?? '';
  return rows.filter(({ submission: s, email }) => s.submittedAt != null &&
    (!filter.status || s.currentStatus === filter.status) &&
    (!filter.direction || s.draft.direction === filter.direction) &&
    (!q || [s.receiptNo, email, s.draft.title].some(v => v.toLowerCase().includes(q))))
    .sort((a, b) => b.submission.submittedAt!.getTime() - a.submission.submittedAt!.getTime() || a.submission.id.localeCompare(b.submission.id));
}

export function tableRow({ submission: s, email }: TableSource, includeUrls = false): TableRow {
  const d = s.draft;
  const declaration = (v: boolean | null) => v === true ? '已确认' : v === false ? '未确认' : '未填写';
  const statuses: Record<string, string> = { passed: '已核验', failed: '核验未通过', pending: '待核验', checking: '核验中' };
  return { id: s.id, cells: [s.receiptNo, tableDate(s.submittedAt), email, d.title, tableDirectionLabels[d.direction] ?? d.direction, forms[d.workForm] ?? d.workForm, tableStatusLabels[s.currentStatus] ?? s.currentStatus, String(s.currentVersionNo), tableDate(s.updatedAt), d.synopsis, d.creativeStatement, d.aiContributionPercent == null ? '' : String(d.aiContributionPercent), d.aiTools.join('、'), d.aiWorkflow, d.humanContribution, declaration(d.rightsConfirmed), declaration(d.aiLabelConfirmed), declaration(d.templateConfirmed),
    ...tablePurposes.flatMap(purpose => { const link = s.mediaLinks.find(l => l.purpose === purpose); return [includeUrls ? link?.originalUrl ?? '' : '', link ? statuses[link.precheckStatus] ?? link.precheckStatus : '未填写']; })],
    links: s.mediaLinks.map(l => ({ id: l.id, purpose: l.purpose, precheckStatus: l.precheckStatus })) };
}

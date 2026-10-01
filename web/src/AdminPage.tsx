import { useEffect, useMemo, useState } from "react";
import { api, ApiError, downloadFile } from "./api";
import { normalizePrecheckFindings } from "../../src/submission/types";
import type { SubmissionDraft } from "../../src/submission/types";
import { SubmissionTable } from './SubmissionTable';

type AdminSummary = { id: string; receiptNo: string; title: string; direction: string; workForm: string; currentStatus: string; currentVersionNo: number; submittedAt: string | null; updatedAt: string; submitterEmail: string };
type AdminSubmission = Omit<AdminSummary, "title" | "direction" | "workForm"> & { ownerUserId: string; draftRevision: number; draft: SubmissionDraft; mediaLinks: Array<{ id: string; purpose: string; provider: string | null; precheckStatus: string; failureCode: string | null; precheckFindings: Array<{ code: string; field: string; message: string }>; checkedAt: string | null; expiresAt: string | null }> };

const transitions: Record<string, string[]> = { submitted: ["qualification_pass", "needs_supplement", "invalid", "withdrawn"], needs_supplement: ["submitted", "invalid"], qualification_pass: ["reviewing", "invalid"], reviewing: ["shortlisted", "not_selected", "invalid"], shortlisted: ["winner", "not_selected"] };
const statusLabels: Record<string, string> = { draft: "草稿", checking_links: "链接检查中", ready: "待提交", submitted: "待资格审查", needs_supplement: "待补充材料", qualification_pass: "资格审查通过", reviewing: "专业初评中", shortlisted: "入围", winner: "获奖", not_selected: "未入选", withdrawn: "已撤回", invalid: "资格不通过" };
const purposeLabels: Record<string, string> = { mainWork: "主体作品", makingOf: "制作解析", guideVideo: "导览视频", experience: "体验链接" };
const directionLabels: Record<string, string> = { frontier_tech: "前沿科技", traditional_culture: "传统文化", science_fiction: "科学幻想" };
const formLabels: Record<string, string> = { narrative: "叙事影像", documentary: "纪录影像", sci_fi: "科幻影像", experimental: "实验影像", animation: "动画", realtime: "实时作品", scientific_visualization: "科学可视化", three_d: "三维影像", vr: "VR", mr: "MR", other: "其他" };

function formatDate(value: string | null): string { return value ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "未正式提交"; }

export function AdminPage() {
  const [view, setView] = useState<'review' | 'table'>(() => window.location.hash.includes('view=table') ? 'table' : 'review');
  const [items, setItems] = useState<AdminSummary[]>([]);
  const [selected, setSelected] = useState<AdminSubmission | null>(null);
  const [targetStatus, setTargetStatus] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const loadDetail = async (id: string) => {
    try {
      const result = await api<{ submission: AdminSubmission }>(`/admin/submissions/${id}`);
      setSelected(result.data.submission);
      setTargetStatus(transitions[result.data.submission.currentStatus]?.[0] ?? "");
      setReason("");
    } catch { setNotice("投稿详情暂时无法加载，请刷新后重试。"); }
  };

  const loadList = async () => {
    setLoading(true); setLoginRequired(false);
    try {
      const result = await api<{ items: AdminSummary[] }>("/admin/submissions");
      setItems(result.data.items);
      if (selected && result.data.items.some((item) => item.id === selected.id)) await loadDetail(selected.id);
      else if (result.data.items[0]) await loadDetail(result.data.items[0].id);
      setNotice(null);
    } catch (error) {
      setLoginRequired(error instanceof ApiError && (error.status === 401 || error.status === 403));
      setNotice(error instanceof ApiError && error.status === 401 ? "请先使用管理员账号登录。" : error instanceof ApiError && error.status === 403 ? "当前账号没有管理权限或尚未启用 MFA。" : "管理数据暂时无法加载，请稍后重试。");
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadList(); }, []);
  const availableTransitions = useMemo(() => selected ? transitions[selected.currentStatus] ?? [] : [], [selected]);

  const openVerifiedLink = async (linkId: string) => {
    if (!selected) return; setWorking(true);
    try {
      const result = await api<{ url: string }>(`/admin/submissions/${selected.id}/media-links/${linkId}/open`, { method: "POST", body: JSON.stringify({ reason: "资格审查查看公开视频" }) });
      window.open(result.data.url, "_blank", "noopener,noreferrer"); setNotice("已记录打开审计，正在打开已核验链接。");
    } catch (error) { setNotice(error instanceof ApiError ? error.message : "链接暂时无法打开。"); }
    finally { setWorking(false); }
  };

  const copyVerifiedLink = async (linkId: string) => {
    if (!selected) return; setWorking(true);
    try {
      const result = await api<{ url: string }>(`/admin/submissions/${selected.id}/media-links/${linkId}/copy`, { method: "POST", body: JSON.stringify({ reason: "资格审查复制公开视频链接" }) });
      await navigator.clipboard.writeText(result.data.url); setNotice("链接已复制，可粘贴到表格或浏览器中。");
    } catch (error) { setNotice(error instanceof ApiError ? error.message : "链接复制失败，请重试。"); }
    finally { setWorking(false); }
  };

  const exportSubmissions = async () => {
    setWorking(true);
    try {
      const blob = await downloadFile("/admin/submissions/export", { method: "POST", body: "{}" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `chinavr-submissions-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url); setNotice("已导出全部已提交作品，可直接用 Excel 或飞书表格打开。");
    } catch (error) { setNotice(error instanceof ApiError ? error.message : "导出失败，请重试。"); }
    finally { setWorking(false); }
  };

  const submitTransition = async () => {
    if (!selected || !targetStatus || reason.trim().length < 2) return; setWorking(true);
    try {
      const result = await api<{ submission: AdminSubmission }>(`/admin/submissions/${selected.id}/transitions`, { method: "POST", body: JSON.stringify({ targetStatus, expectedStatus: selected.currentStatus, reason }) });
      setSelected(result.data.submission); setItems((current) => current.map((item) => item.id === selected.id ? { ...item, currentStatus: result.data.submission.currentStatus, updatedAt: result.data.submission.updatedAt } : item)); setTargetStatus(transitions[result.data.submission.currentStatus]?.[0] ?? ""); setReason(""); setNotice("状态已更新并写入审计记录。");
    } catch (error) { setNotice(error instanceof ApiError ? error.message : "状态更新失败，请刷新后重试。"); }
    finally { setWorking(false); }
  };

  return <section className="admin-page section-pad" aria-labelledby="admin-title">
    <div className="section-kicker"><span>ADMIN / 01</span><span>REVIEW DESK</span></div>
    <div className="admin-heading"><div><h1 id="admin-title">投稿审查工作台</h1><p>普通管理员可查看投稿资料、复制或打开已核验链接，并导出已提交作品信息。</p></div>{view === 'review' && <div className="admin-heading-actions"><button className="button button-small button-outline" type="button" onClick={() => void exportSubmissions()} disabled={working}>导出全部作品</button><button className="button button-small button-outline" type="button" onClick={() => void loadList()} disabled={loading || working}>刷新列表</button></div>}</div>
    <div className="admin-view-switch"><button type="button" className="button button-small button-outline" aria-pressed={view === 'review'} onClick={() => setView('review')}>投稿审查</button><button type="button" className="button button-small button-outline" aria-pressed={view === 'table'} onClick={() => setView('table')}>投稿汇总表</button></div>
    {view === 'review' && notice && <div className="form-notice info" role="status">{notice}{loginRequired && <> <a href="#login">前往管理员登录</a></>}</div>}
    {view === 'table' ? <SubmissionTable /> : <div className="admin-grid">
      <aside className="admin-list" aria-label="投稿列表">{loading && <p className="muted-copy">正在加载投稿…</p>}{!loading && items.length === 0 && <p className="muted-copy">暂无投稿。</p>}{items.map((item) => <button className={`admin-item ${selected?.id === item.id ? "is-active" : ""}`} type="button" key={item.id} onClick={() => void loadDetail(item.id)}><span className="mono">{item.receiptNo}</span><strong>{item.title}</strong><small>{statusLabels[item.currentStatus] ?? item.currentStatus} · {formatDate(item.submittedAt)} · {item.submitterEmail}</small></button>)}</aside>
      <article className="admin-detail">
        {!selected && <p className="muted-copy">选择一份投稿查看详情。</p>}
        {selected && <>
          <div className="admin-detail-top"><div><span className="mono">{selected.receiptNo}</span><h2>{selected.draft.title}</h2></div><span className="status-pill">{statusLabels[selected.currentStatus] ?? selected.currentStatus}</span></div>
          <dl className="admin-facts"><div><dt>提交时间</dt><dd>{formatDate(selected.submittedAt)}</dd></div><div><dt>提交编号</dt><dd className="mono">{selected.receiptNo}</dd></div><div><dt>投稿者邮箱</dt><dd>{selected.submitterEmail}</dd></div><div><dt>投稿方向</dt><dd>{directionLabels[selected.draft.direction] ?? selected.draft.direction}</dd></div><div><dt>作品形式</dt><dd>{formLabels[selected.draft.workForm] ?? selected.draft.workForm}</dd></div><div><dt>版本</dt><dd>v{selected.currentVersionNo} · 修订 {selected.draftRevision}</dd></div></dl>
          <div className="admin-copy"><h3>作品简介</h3><p>{selected.draft.synopsis || "未填写"}</p><h3>创作说明</h3><p>{selected.draft.creativeStatement || "未填写"}</p><h3>AI 与人工创作信息</h3><p>AI 工具：{selected.draft.aiTools.join("、") || "未填写"}<br />AI 创作流程：{selected.draft.aiWorkflow || "未填写"}<br />人工贡献：{selected.draft.humanContribution || "未填写"}</p></div>
          <h3>作品链接</h3><div className="admin-links">{selected.mediaLinks.length === 0 && <p className="muted-copy">尚未保存视频链接。</p>}{selected.mediaLinks.map((link) => <div className="admin-link" key={link.id}><strong>{purposeLabels[link.purpose] ?? link.purpose}</strong><span>{link.provider ?? "未识别平台"} · {link.precheckStatus === "passed" ? "已核验" : link.precheckStatus === "failed" ? "预检未通过" : "待核验"}</span>{link.failureCode && <small>{link.failureCode}</small>}{normalizePrecheckFindings(link.precheckFindings).map((finding) => <small key={`${link.id}-${finding.code}`}>{finding.message}</small>)}<div className="admin-link-actions">{link.precheckStatus === "passed" && <button className="text-button" type="button" onClick={() => void openVerifiedLink(link.id)} disabled={working}>查看公开视频 ↗</button>}<button className="text-button" type="button" onClick={() => void copyVerifiedLink(link.id)} disabled={working}>复制链接</button></div></div>)}</div>
          {availableTransitions.length > 0 && <div className="admin-transition"><h3>审查决定</h3><label htmlFor="admin-target">下一状态</label><select id="admin-target" value={targetStatus} onChange={(event) => setTargetStatus(event.target.value)}>{availableTransitions.map((status) => <option key={status} value={status}>{statusLabels[status] ?? status}</option>)}</select><label htmlFor="admin-reason">处理原因</label><textarea id="admin-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={2} maxLength={1000} placeholder="填写本次审查决定的原因" /><button className="button button-cinnabar" type="button" onClick={() => void submitTransition()} disabled={working || reason.trim().length < 2}>{working ? "正在保存…" : "保存状态决定"}</button></div>}
        </>}
      </article>
    </div>}
  </section>;
}

import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "./api";

type AdminSummary = { id: string; receiptNo: string; title: string; direction: string; workForm: string; currentStatus: string; currentVersionNo: number; updatedAt: string };
type AdminSubmission = AdminSummary & { ownerUserId: string; draftRevision: number; draft: Record<string, unknown>; mediaLinks: Array<{ id: string; purpose: string; provider: string | null; precheckStatus: string; failureCode: string | null; precheckFindings: Array<{ code: string; field: string; message: string }>; checkedAt: string | null; expiresAt: string | null }> };

const transitions: Record<string, string[]> = {
  submitted: ["qualification_pass", "needs_supplement", "invalid", "withdrawn"],
  needs_supplement: ["submitted", "invalid"],
  qualification_pass: ["reviewing", "invalid"],
  reviewing: ["shortlisted", "not_selected", "invalid"],
  shortlisted: ["winner", "not_selected"],
};

export function AdminPage() {
  const [items, setItems] = useState<AdminSummary[]>([]);
  const [selected, setSelected] = useState<AdminSubmission | null>(null);
  const [targetStatus, setTargetStatus] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const result = await api<{ items: AdminSummary[] }>("/admin/submissions");
      setItems(result.data.items);
      if (selected) await loadDetail(selected.id);
      else if (result.data.items[0]) await loadDetail(result.data.items[0].id);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof ApiError && error.status === 403 ? "当前账号没有管理权限或尚未启用 MFA。" : "管理数据暂时无法加载，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      const result = await api<{ submission: AdminSubmission }>(`/admin/submissions/${id}`);
      setSelected(result.data.submission);
      setTargetStatus(transitions[result.data.submission.currentStatus]?.[0] ?? "");
      setReason("");
    } catch {
      setNotice("投稿详情暂时无法加载，请刷新后重试。");
    }
  };

  useEffect(() => { void loadList(); }, []);

  const availableTransitions = useMemo(() => selected ? transitions[selected.currentStatus] ?? [] : [], [selected]);

  const submitTransition = async () => {
    if (!selected || !targetStatus || reason.trim().length < 2) return;
    setWorking(true);
    try {
      const result = await api<{ submission: AdminSubmission }>(`/admin/submissions/${selected.id}/transitions`, {
        method: "POST",
        body: JSON.stringify({ targetStatus, expectedStatus: selected.currentStatus, reason }),
      });
      setSelected(result.data.submission);
      setItems((current) => current.map((item) => item.id === selected.id ? { ...item, currentStatus: result.data.submission.currentStatus, updatedAt: result.data.submission.updatedAt } : item));
      setTargetStatus(transitions[result.data.submission.currentStatus]?.[0] ?? "");
      setReason("");
      setNotice("状态已更新并写入审计记录。");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "状态更新失败，请刷新后重试。");
    } finally {
      setWorking(false);
    }
  };

  return <section className="admin-page section-pad" aria-labelledby="admin-title">
    <div className="section-kicker"><span>ADMIN / 01</span><span>REVIEW DESK</span></div>
    <div className="admin-heading"><div><h1 id="admin-title">投稿审查工作台</h1><p>只显示经过权限校验的投稿摘要和脱敏预检结果。打开外部平台链接仍需单独的受控审计接口。</p></div><button className="button button-small button-outline" type="button" onClick={() => void loadList()} disabled={loading}>刷新列表</button></div>
    {notice && <div className="form-notice info" role="status">{notice}</div>}
    <div className="admin-grid">
      <aside className="admin-list" aria-label="投稿列表">
        {loading && <p className="muted-copy">正在加载投稿…</p>}
        {!loading && items.length === 0 && <p className="muted-copy">暂无投稿。</p>}
        {items.map((item) => <button className={`admin-item ${selected?.id === item.id ? "is-active" : ""}`} type="button" key={item.id} onClick={() => void loadDetail(item.id)}><span className="mono">{item.receiptNo}</span><strong>{item.title}</strong><small>{item.currentStatus} · v{item.currentVersionNo}</small></button>)}
      </aside>
      <article className="admin-detail">
        {!selected && <p className="muted-copy">选择一份投稿查看详情。</p>}
        {selected && <>
          <div className="admin-detail-top"><div><span className="mono">{selected.receiptNo}</span><h2>{selected.title}</h2></div><span className="status-pill">{selected.currentStatus}</span></div>
          <dl className="admin-facts"><div><dt>投稿方向</dt><dd>{selected.direction}</dd></div><div><dt>作品形式</dt><dd>{selected.workForm}</dd></div><div><dt>版本</dt><dd>v{selected.currentVersionNo} · 修订 {selected.draftRevision}</dd></div></dl>
          <h3>链接预检摘要</h3>
          <div className="admin-links">{selected.mediaLinks.length === 0 && <p className="muted-copy">尚未保存视频链接。</p>}{selected.mediaLinks.map((link) => <div className="admin-link" key={link.id}><strong>{link.purpose}</strong><span>{link.provider ?? "未识别平台"} · {link.precheckStatus}</span>{link.failureCode && <small>{link.failureCode}</small>}{link.precheckFindings.map((finding) => <small key={`${link.id}-${finding.code}`}>{finding.message}</small>)}</div>)}</div>
          {availableTransitions.length > 0 && <div className="admin-transition"><h3>状态流转</h3><label htmlFor="admin-target">下一状态</label><select id="admin-target" value={targetStatus} onChange={(event) => setTargetStatus(event.target.value)}>{availableTransitions.map((status) => <option key={status} value={status}>{status}</option>)}</select><label htmlFor="admin-reason">处理原因</label><textarea id="admin-reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={2} maxLength={1000} placeholder="填写本次审查决定的原因" /><button className="button button-cinnabar" type="button" onClick={() => void submitTransition()} disabled={working || reason.trim().length < 2}>{working ? "正在保存…" : "保存状态决定"}</button></div>}
        </>}
      </article>
    </div>
  </section>;
}

import { useEffect, useState } from 'react';
import { api, ApiError, downloadFile } from './api';
import { tableDirectionLabels, tableHeaders, tablePurposes, tableStatusLabels, type TableFilter, type TablePage, type TableRow } from '../../src/submission/table';
import './styles/submission-table.css';

export function SubmissionTable() {
  const [data, setData] = useState<TablePage | null>(null);
  const [filter, setFilter] = useState<TableFilter>({});
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let blocked = false;
    let request: AbortController | undefined;
    setData(null); setDenied(false);
    const load = async () => {
      if (inFlight || blocked || disposed) return;
      inFlight = true; request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 15000);
      setLoading(true);
      try {
        const query = new URLSearchParams({ page: String(page) });
        for (const [key, value] of Object.entries(filter)) if (value) query.set(key, value);
        const result = await api<TablePage>(`/admin/submissions/table?${query}`, { signal: request.signal });
        if (!disposed) { setData(result.data); setError(''); }
      } catch (err) {
        if (!disposed) {
          blocked = err instanceof ApiError && [401, 403].includes(err.status);
          if (blocked) { setData(null); setDenied(true); }
          setError(err instanceof ApiError ? err.message : '暂时无法更新，请检查网络后重试。');
        }
      } finally { clearTimeout(timeout); inFlight = false; if (!disposed) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 10000);
    const visible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; request?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [filter, page, refresh]);

  async function exportExcel(all: boolean) {
    setWorking(true); setNotice('');
    try {
      const blob = await downloadFile('/admin/submissions/table/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(all ? {} : filter) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `ChinaVR-投稿汇总-${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())}.xlsx`;
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      setNotice('Excel 已导出，可发送给评审或导入飞书表格。文件为当前数据快照。');
    } catch (err) { setNotice(err instanceof ApiError ? err.message : '导出失败，请重试。'); }
    finally { setWorking(false); }
  }
  async function linkAction(row: TableRow, linkId: string, action: 'open' | 'copy') {
    setWorking(true); setNotice('');
    const popup = action === 'open' ? window.open('about:blank', '_blank') : null;
    if (popup) popup.opener = null;
    try {
      const result = await api<{ url: string }>(`/admin/submissions/${row.id}/media-links/${linkId}/${action}`, { method: 'POST', body: JSON.stringify({ reason: action === 'open' ? '投稿汇总表查看已核验作品' : '投稿汇总表复制作品链接' }) });
      if (action === 'copy') { await navigator.clipboard.writeText(result.data.url); setNotice('链接已复制。'); }
      else if (popup) popup.location.replace(result.data.url);
      else setNotice('浏览器阻止了新窗口，请允许弹出窗口或使用复制链接。');
    } catch (err) { popup?.close(); setNotice(err instanceof ApiError ? err.message : '操作失败，请重试。'); }
    finally { setWorking(false); }
  }
  const effectivePage = data?.page ?? page;
  return <section className="submission-table" aria-label="投稿汇总表">
    <div className="st-intro"><div><h2>投稿汇总表</h2><p>历史投稿与新投稿统一收录 · 每份正式投稿一行 · 邮箱识别提交者</p></div><strong>{data ? `${data.total} 件作品` : denied ? '请先登录' : '正在读取'}</strong></div>
    <form className="st-filters" onSubmit={e => { e.preventDefault(); setPage(1); setFilter({ ...(q.trim() ? { q: q.trim() } : {}), ...(status ? { status } : {}), ...(direction ? { direction } : {}) }); }}>
      <label>搜索<input value={q} onChange={e => setQ(e.target.value)} maxLength={200} placeholder="提交编号、作品名称或邮箱" /></label>
      <label>投稿方向<select value={direction} onChange={e => setDirection(e.target.value)}><option value="">全部方向</option>{Object.entries(tableDirectionLabels).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      <label>作品状态<select value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{Object.entries(tableStatusLabels).filter(([v]) => !['draft', 'ready', 'checking_links'].includes(v)).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      <button className="button button-small button-outline" type="submit">筛选</button><button className="text-button" type="button" onClick={() => { setQ(''); setStatus(''); setDirection(''); setPage(1); setFilter({}); }}>清空筛选</button>
    </form>
    <div className="st-toolbar"><div className="st-actions"><button className="button button-small button-cinnabar" disabled={working || !data || denied} onClick={() => void exportExcel(true)}>导出全部 Excel</button><button className="button button-small button-outline" disabled={working || !data || denied} onClick={() => void exportExcel(false)}>导出筛选结果</button><button className="text-button" disabled={loading} onClick={() => setRefresh(v => v + 1)}>立即刷新</button></div><span role="status">{loading ? '正在更新…' : error ? '更新失败' : '每 10 秒自动更新'}{data && ` · 最后更新 ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', timeStyle: 'medium' }).format(new Date(data.refreshedAt))}`}</span></div>
    {error && <p role="alert" className="form-notice">{error}{denied && <> <a href="#login">前往管理员登录</a></>}{data && ' 当前显示上次成功读取的数据。'}</p>}
    {notice && <p role="status" className="form-notice">{notice}</p>}
    {data && <><div className="st-scroll" tabIndex={0} aria-label="投稿数据，可横向滚动查看全部字段"><table><caption>投稿信息汇总，共 {data.total} 件作品</caption><thead><tr>{tableHeaders.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{data.items.map(row => <tr key={row.id}>{row.cells.map((cell, i) => {
      if (i >= 18 && i % 2 === 0) {
        const link = row.links.find(l => l.purpose === tablePurposes[(i - 18) / 2]);
        return <td key={i}>{link ? <div className="st-link-actions"><button className="text-button" disabled={working} onClick={() => void linkAction(row, link.id, 'copy')}>复制链接</button>{link.precheckStatus === 'passed' && <button className="text-button" disabled={working} onClick={() => void linkAction(row, link.id, 'open')}>查看作品 ↗</button>}</div> : '未填写'}</td>;
      }
      return <td key={i}>{cell.length > 90 ? <details><summary>{cell.slice(0, 70)}… 展开</summary><p>{cell}</p></details> : cell || '—'}</td>;
    })}</tr>)}</tbody></table>{data.total === 0 && <p className="st-empty">暂无符合条件的正式投稿。</p>}</div><div className="st-pagination"><span>第 {effectivePage} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页 · 每页 {data.pageSize} 件</span><button className="text-button" disabled={effectivePage <= 1 || loading} onClick={() => setPage(effectivePage - 1)}>上一页</button><button className="text-button" disabled={effectivePage * data.pageSize >= data.total || loading} onClick={() => setPage(effectivePage + 1)}>下一页</button></div></>}
    <p className="st-footnote">左右滚动查看全部字段。导出包含所选范围的全部记录，不限当前页。Excel 可分享或导入飞书；后续新增投稿需重新导出。</p>
  </section>;
}

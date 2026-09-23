import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { MediaPurpose, Submission, SubmissionDraft } from "../../src/submission/types";
import { ApiError, api } from "./api";

type SavedSubmission = Omit<Submission, "createdAt" | "updatedAt" | "mediaLinks"> & {
  createdAt: string;
  updatedAt: string;
  mediaLinks: Array<{ id: string; purpose: MediaPurpose; originalUrl: string; precheckStatus: string; provider: string | null; failureCode: string | null; precheckFindings: Array<{ code: string; field: string; message: string }> }>;
};
type SavedResponse = { submission: SavedSubmission };
type LinkInputs = Record<MediaPurpose, string>;
const emptyDraft: SubmissionDraft = {
  title: "", direction: "frontier_tech", workForm: "animation", synopsis: "", creativeStatement: "",
  aiContributionPercent: null, aiTools: [], aiWorkflow: "", humanContribution: "", rightsConfirmed: false, aiLabelConfirmed: false, templateConfirmed: null,
};
const emptyLinks: LinkInputs = { mainWork: "", makingOf: "", guideVideo: "", experience: "" };
const steps = ["方向与形式", "主体作品链接", "制作解析链接", "导览与体验（选填）", "权利与 AI 披露", "确认提交"];
const directions = { frontier_tech: "前沿科技", traditional_culture: "传统文化", science_fiction: "科学幻想" };
const forms = { narrative: "叙事影像", documentary: "纪录影像", sci_fi: "科幻影像", experimental: "实验影像", animation: "动画", realtime: "实时作品", scientific_visualization: "科学可视化", three_d: "三维影像", vr: "VR", mr: "MR", other: "其他" };

export function SubmissionPage() {
  const [loading, setLoading] = useState(true);
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [error, setError] = useState("");
  const [server, setServer] = useState<SavedSubmission | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [draft, setDraft] = useState<SubmissionDraft>({ ...emptyDraft });
  const [links, setLinks] = useState<LinkInputs>({ ...emptyLinks });
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [reload, setReload] = useState(0);
  const idempotency = useRef(new Map<string, string>());
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    const load = async () => {
      setLoading(true);
      setUnauthenticated(false);
      setError("");
      setReadOnly(false);
      try {
        const { data: session } = await api<{ user: { roles: string[] } }>("/me", { signal: abort.signal });
        if (!session.user.roles.includes("participant")) throw new Error("当前账号没有参赛投稿权限");
        let id = new URLSearchParams(window.location.hash.split("?")[1]).get("id");
        if (!id) {
          const { data } = await api<{ items: Array<{ id: string }> }>("/submissions?status=draft&limit=1", { signal: abort.signal });
          id = data.items[0]?.id ?? null;
        }
        if (id) {
          const { data } = await api<SavedResponse>(`/submissions/${encodeURIComponent(id)}`, { signal: abort.signal });
          setServer(data.submission);
          setReadOnly(data.submission.currentStatus !== "draft");
          setDraft(data.submission.draft);
          setLinks({ ...emptyLinks, ...Object.fromEntries(data.submission.mediaLinks.map((link) => [link.purpose, link.originalUrl])) });
          window.history.replaceState(null, "", `#submit?id=${encodeURIComponent(id)}`);
          setDirty(false);
        }
      } catch (failure) {
        if (abort.signal.aborted) return;
        setUnauthenticated(failure instanceof ApiError && failure.status === 401);
        setError(failure instanceof Error ? failure.message : "读取草稿失败，请重试");
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => abort.abort();
  }, [reload]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a");
      if (anchor && !window.confirm("有尚未保存的内容。离开会丢失这些修改，是否离开？")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", click, true); };
  }, [dirty]);

  function edit<Key extends keyof SubmissionDraft>(key: Key, value: SubmissionDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function keyFor(payload: string) {
    if (!idempotency.current.has(payload)) idempotency.current.set(payload, crypto.randomUUID());
    return idempotency.current.get(payload)!;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || readOnly) return;
    if (draft.title.trim().length < 2) { setStep(0); setError("请填写 2—100 个字符的作品名称，再保存草稿"); return; }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      let current: SavedSubmission;
      if (server) {
        current = server;
      } else {
        const payload = JSON.stringify({ title: draft.title, direction: draft.direction, workForm: draft.workForm });
        const { data } = await api<SavedResponse>("/submissions", { method: "POST", headers: { "Idempotency-Key": keyFor(payload) }, body: payload });
        current = data.submission;
        setServer(current);
        window.history.replaceState(null, "", `#submit?id=${encodeURIComponent(current.id)}`);
      }
      const { data } = await api<SavedResponse>(`/submissions/${current.id}/draft`, { method: "PATCH", headers: { "If-Match": `"${current.draftRevision}"` }, body: JSON.stringify(draft) });
      current = data.submission;
      setServer(current);
      for (const purpose of Object.keys(links) as MediaPurpose[]) {
        const url = links[purpose].trim();
        const stored = current.mediaLinks.find((link) => link.purpose === purpose);
        if (url === (stored?.originalUrl ?? "")) continue;
        if (!url && stored) throw new Error("已保存的链接暂不支持删除，请填入替换链接后再保存");
        const payload = JSON.stringify({ purpose, url });
        const { data: updated }: { data: SavedResponse } = await api<SavedResponse>(`/submissions/${current.id}/media-links`, { method: "POST", headers: { "If-Match": `"${current.draftRevision}"`, "Idempotency-Key": keyFor(`${current.id}:${current.draftRevision}:${payload}`) }, body: payload });
        current = updated.submission;
        setServer(current);
      }
      setDraft(current.draft);
      setLinks({ ...emptyLinks, ...Object.fromEntries(current.mediaLinks.map((link) => [link.purpose, link.originalUrl])) });
      setDirty(false);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "保存失败，请重试";
      setError(`${message}。尚未保存的输入仍保留在本页。`);
      setDirty(true);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function submitFinal() {
    if (busyRef.current || readOnly || !server) return;
    if (dirty) {
      setError("请先保存当前修改，再确认提交。");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await api<SavedResponse>(`/submissions/${server.id}/submit`, { method: "POST", headers: { "If-Match": `"${server.draftRevision}"` } });
      setServer(data.submission);
      setReadOnly(true);
      setDirty(false);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "提交失败，请重试";
      setError(`${message}。当前草稿仍保留。`);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function runPrecheck(purpose: MediaPurpose) {
    if (busyRef.current || readOnly || !server) return;
    const link = server.mediaLinks.find((item) => item.purpose === purpose && item.originalUrl === links[purpose]);
    if (!link) {
      setError("请先保存当前链接，再开始预检。");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { data } = await api<SavedResponse>(`/submissions/${server.id}/media-links/${link.id}/prechecks`, { method: "POST" });
      setServer(data.submission);
      setDirty(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "链接预检失败，请重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const time = server ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(server.updatedAt)) : null;
  const status = busy ? "正在处理…" : readOnly ? "已提交 · " + (server?.receiptNo ?? "") : dirty ? "有未保存的修改" : time ? "已保存于 " + time + " · 未正式提交" : "尚未创建草稿";
  const linkField = (purpose: MediaPurpose, label: string) => {
    const saved = server?.mediaLinks.find((link) => link.purpose === purpose && link.originalUrl === links[purpose]);
    const precheckText = !saved ? "未保存此链接" : saved.precheckStatus === "passed" ? "预检通过" : saved.precheckStatus === "failed" ? "预检未通过 · " + (saved.failureCode ?? "请查看详情") : "等待预检";
    return <label className="field" key={purpose}>{label}
      <input name={purpose} type="url" inputMode="url" spellCheck={false} autoComplete="off" maxLength={2048} placeholder="https://…" value={links[purpose]} onChange={(event) => { setLinks({ ...links, [purpose]: event.target.value }); setDirty(true); }} />
      <span className="field-help">{precheckText}</span>
      {saved && !readOnly && <button className="text-button" type="button" disabled={busy} onClick={() => void runPrecheck(purpose)}>开始预检</button>}
    </label>;
  }

  return <section className="submission-page section-pad" aria-labelledby="submission-title">
    <div className="submission-head"><div><div className="section-kicker"><span>SUBMISSION</span><span>作品草稿</span></div><h1 id="submission-title">准备一份<br /><em>完整的投稿。</em></h1></div><a className="text-link dark-link" href="#home">返回公开站 ↗</a></div>
    {loading ? <p role="status">正在读取账户与草稿…</p> : unauthenticated ? <div className="submission-card"><h2>登录后开始投稿</h2><p>草稿保存在你的账号下，可以在下次登录后继续填写。</p><a className="button button-cinnabar" href="#login">登录账号 ↗</a></div> : <div className="submission-layout">
      <aside className="step-rail" aria-label="投稿步骤"><div className="rail-status">✎ 草稿 · 未提交</div>{steps.map((label, index) => <button className={`step-button ${step === index ? "is-active" : ""}`} aria-current={step === index ? "step" : undefined} disabled={busy} onClick={() => setStep(index)} key={label}><span className="mono">0{index + 1}</span>{label}</button>)}</aside>
      <form className="submission-card" onSubmit={save}>
        <div className="submission-card-head"><div><span className="mono">STEP 0{step + 1} / 06</span><h2>{steps[step]}</h2></div><span className="save-status" role="status">{status}</span></div>
        {server && <p className="field-help">草稿编号：{server.receiptNo} · 当前为第 {server.currentVersionNo} 版</p>}
        {error && <div className="form-notice error" role="alert" tabIndex={-1} ref={errorRef}>{error}<br /><button className="text-button" type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm("重新读取会替换本页未保存的内容，是否读取服务器草稿？")) setReload((value) => value + 1); }}>重新读取服务器草稿</button></div>}
        <fieldset disabled={busy || readOnly} className="draft-fields">
          {step === 0 && <><p className="step-lead">先确定作品方向与形式。简介和说明可先保存未完成内容。</p><div className="field-grid">
            <label className="field">作品名称<input name="title" autoComplete="off" minLength={2} maxLength={100} value={draft.title} onChange={(e) => edit("title", e.target.value)} required /></label>
            <label className="field">投稿方向<select name="direction" value={draft.direction} onChange={(e) => edit("direction", e.target.value as SubmissionDraft["direction"])}>{Object.entries(directions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field">作品形式<select name="workForm" value={draft.workForm} onChange={(e) => edit("workForm", e.target.value as SubmissionDraft["workForm"])}>{Object.entries(forms).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div><label className="field">作品简介<textarea name="synopsis" maxLength={2000} value={draft.synopsis} onChange={(e) => edit("synopsis", e.target.value)} /></label><label className="field">创作说明<textarea name="creativeStatement" maxLength={3000} value={draft.creativeStatement} onChange={(e) => edit("creativeStatement", e.target.value)} /></label></>}
          {step === 1 && linkField("mainWork", "主体作品链接")}
          {step === 2 && linkField("makingOf", "制作解析链接")}
          {step === 3 && <>{linkField("guideVideo", "导览视频链接（VR / MR / 实时作品必填）")}{linkField("experience", "体验链接（选填）")}</>}
          {step >= 1 && step <= 3 && <div className="declaration-note"><p>保存链接后可发起预检；预检结果只代表当前链接状态，不能替代组委会资格审查。</p></div>}
          {step === 4 && <><label className="field">AI 贡献比例（%）<input name="aiContributionPercent" type="number" min={80} max={100} step={1} value={draft.aiContributionPercent ?? ""} onChange={(e) => edit("aiContributionPercent", e.target.value ? Number(e.target.value) : null)} /></label><label className="field">AI 工具（用逗号分隔）<input name="aiTools" maxLength={3000} value={draft.aiTools.join(",")} onChange={(e) => edit("aiTools", e.target.value.split(","))} /></label><label className="field">AI 创作流程<textarea name="aiWorkflow" maxLength={3000} value={draft.aiWorkflow} onChange={(e) => edit("aiWorkflow", e.target.value)} /></label><label className="field">人工贡献说明<textarea name="humanContribution" maxLength={3000} value={draft.humanContribution} onChange={(e) => edit("humanContribution", e.target.value)} /></label><label className="check-row"><input name="rightsConfirmed" type="checkbox" checked={draft.rightsConfirmed} onChange={(e) => edit("rightsConfirmed", e.target.checked)} />我确认已取得作品素材、声音和肖像的必要授权。</label><label className="check-row"><input name="aiLabelConfirmed" type="checkbox" checked={draft.aiLabelConfirmed} onChange={(e) => edit("aiLabelConfirmed", e.target.checked)} />我确认已按要求标识 AI 生成内容。</label></>}
          {step === 5 && <><div className="review-list"><div className="review-row"><span>作品名称</span><span>{draft.title || "待填写"}</span></div><div className="review-row"><span>投稿方向</span><span>{directions[draft.direction]}</span></div>{(["mainWork", "makingOf", "guideVideo"] as const).map((purpose) => <div className="review-row" key={purpose}><span>{{ mainWork: "主体作品", makingOf: "制作解析", guideVideo: "导览视频" }[purpose]}</span><span>{links[purpose] ? "已保存，待检测" : "待填写 / 依作品形式要求"}</span></div>)}</div>{readOnly ? <p className="form-notice success">投稿已提交，回执号：{server?.receiptNo}。预检与资格审查功能将在后续迭代接入。</p> : <><p id="submit-help" className="form-notice">提交前请确认主体作品链接、版权声明和 AI 内容声明已完成。预检与资格审查功能将在后续迭代接入。</p><button className="button button-cinnabar" disabled={!server || busy} aria-describedby="submit-help" onClick={() => void submitFinal()} type="button">{busy ? "正在提交…" : "确认提交"}</button></>}</>}
        </fieldset>
        {!readOnly && <div className="submission-actions"><button className="button button-cinnabar" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存草稿"}</button>{step < 5 && <button className="button button-outline" type="button" disabled={busy} onClick={() => setStep(step + 1)}>下一步：{steps[step + 1]} →</button>}</div>}
      </form>
    </div>}
  </section>;
}

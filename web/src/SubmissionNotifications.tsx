import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SUBMISSION_DEADLINE } from "../../src/submission/deadline";
import { api, ApiError } from "./api";
import "./styles/submission-notifications.css";

type WindowStatus = { deadline: string; serverNow: string; closed: boolean };
type Receipt = { id: string; title: string; receiptNo: string };
type NoticeUser = { id: string; roles: string[] };

export function useSubmissionWindow() {
  const [state, setState] = useState({ closed: false, loading: true });
  useEffect(() => {
    const abort = new AbortController();
    let anchor: { time: number; elapsed: number; deadline: number; closed: boolean } | null = null;
    let pending = false;
    const tick = () => {
      if (!anchor) return;
      // Use elapsed time instead of the visitor's wall clock once the server responds.
      const closed = anchor.closed || anchor.time + performance.now() - anchor.elapsed >= anchor.deadline;
      // Do not re-render the galaxy homepage on every clock tick.
      setState(current => current.closed === closed && !current.loading ? current : { closed, loading: false });
    };
    const refresh = async () => {
      if (pending || abort.signal.aborted) return;
      pending = true;
      const requestAbort = new AbortController();
      const cancelRequest = () => requestAbort.abort();
      abort.signal.addEventListener("abort", cancelRequest, { once: true });
      const timeout = window.setTimeout(cancelRequest, 10_000);
      try {
        const { data } = await api<WindowStatus>("/submission-window", { signal: requestAbort.signal });
        if (!Number.isFinite(Date.parse(data.serverNow)) || !Number.isFinite(Date.parse(data.deadline)) || typeof data.closed !== "boolean") throw new Error("截止状态格式无效");
        if (!abort.signal.aborted) anchor = { time: Date.parse(data.serverNow), elapsed: performance.now(), deadline: Date.parse(data.deadline), closed: data.closed };
      } catch {
        // A failed status request must not enable writes. Keep a prior server clock,
        // or show a retrying state; the backend remains the final authority.
        if (!anchor && !abort.signal.aborted) setState({ closed: Date.now() >= Date.parse(SUBMISSION_DEADLINE), loading: true });
      } finally {
        clearTimeout(timeout);
        abort.signal.removeEventListener("abort", cancelRequest);
        pending = false;
        if (!abort.signal.aborted) tick();
      }
    };
    void refresh();
    const timer = window.setInterval(tick, 500);
    const poll = window.setInterval(() => void refresh(), 30_000);
    const resume = () => { tick(); void refresh(); };
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      abort.abort();
      clearInterval(timer);
      clearInterval(poll);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return state;
}

export function SubmissionNotifications({ closed, route, user }: { closed: boolean; route: string; user: NoticeUser | null }) {
  const [view, setView] = useState<"list" | "message" | null>(null);
  const [receiptState, setReceiptState] = useState<{ userId: string; items: Receipt[]; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const participantId = user?.roles.includes("participant") ? user.id : null;
  // No persistent "already read" flag: each public page entry shows the notice.
  useEffect(() => { setView(closed && route !== "admin" ? "message" : null); }, [closed, route]);
  useEffect(() => {
    const returnToSite = (event: PageTransitionEvent) => { if (event.persisted && closed && route !== "admin") setView("message"); };
    window.addEventListener("pageshow", returnToSite);
    return () => window.removeEventListener("pageshow", returnToSite);
  }, [closed, route]);
  useEffect(() => {
    if (!closed || !participantId || !view) return;
    const abort = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => abort.abort(), 10_000);
    setReceiptState(null);
    void api<{ items: Receipt[] }>("/submissions/receipts", { signal: abort.signal })
      .then(({ data }) => { if (!disposed) setReceiptState({ userId: participantId, items: data.items, failed: false }); })
      .catch((error: unknown) => {
        if (!disposed) setReceiptState({ userId: participantId, items: [], failed: !(error instanceof ApiError && error.status === 401) });
      })
      .finally(() => clearTimeout(timeout));
    return () => { disposed = true; clearTimeout(timeout); abort.abort(); };
  }, [closed, participantId, view, retry]);
  useEffect(() => {
    const element = dialog.current;
    if (!view || !element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const show = () => {
      if (document.querySelector(".galaxy-opening")) return;
      if (!element.open) { element.showModal(); closeButton.current?.focus(); }
      observer.disconnect();
    };
    // Let the existing opening screen release focus before this modal opens.
    const observer = new MutationObserver(show);
    observer.observe(document.body, { childList: true, subtree: true });
    show();
    return () => {
      observer.disconnect();
      element.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [view]);
  const receipts = receiptState?.userId === participantId ? receiptState : null;
  return <>
    <button className="submission-notification-button" type="button" aria-label="通知" aria-haspopup="dialog" onClick={() => setView("list")}>
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg> 通知{closed && <span className="submission-notification-dot" aria-hidden="true" />}
    </button>
    {view && createPortal(<dialog ref={dialog} className="submission-notification-dialog" aria-labelledby="submission-notification-title" onCancel={() => setView(null)} onClick={event => { if (event.target === event.currentTarget) setView(null); }}>
      <div className="submission-notification-top"><span>CHINAVR 2026 · 大会通知</span><button ref={closeButton} type="button" aria-label="关闭通知" onClick={() => setView(null)}>关闭 ×</button></div>
      <h2 id="submission-notification-title">{view === "list" ? "通知" : "投稿已截止，感谢您的参与！"}</h2>
      {view === "list" ? closed
        ? <button className="submission-notification-item" type="button" onClick={() => setView("message")}><span>投稿截止与评审安排</span><small>2026 年 10 月 21 日 · 查看通知 →</small></button>
        : <p>暂无通知。投稿将于北京时间 2026 年 10 月 20 日 24:00 截止。</p>
        : <>
          {receipts?.items.map(item => <p className="submission-notification-receipt" key={item.id}>您的稿件“{item.title}”已成功投递！</p>)}
          {participantId && !receipts && <p role="status">正在核对您的投稿回执…</p>}
          {receipts?.failed && <p role="status">暂时无法读取投稿回执，请稍后重试。<button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>重新读取</button></p>}
          <p>请您持续关注投稿邮箱和大会相关信息，预计评审结束时间为十月三十号，我们会在评审完毕后向投稿者的邮箱发送通知！</p>
          {!user && <p className="submission-notification-hint">登录投稿账号后可查看您的成功投递信息。</p>}
          <button type="button" className="button button-cinnabar" onClick={() => setView(null)}>我知道了</button>
        </>}
    </dialog>, document.body)}
  </>;
}

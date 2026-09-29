import { useEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { useOptionalStudentAccount } from '../contexts/StudentAccount';
import { useGameSync } from '../contexts/GameSyncContext';
import { gameEntry } from '../lib/games/registry';
import { versionRef } from '../lib/games/store';
import type { Game } from '../lib/games/model';
export default function ConnectedGame({ game }: { game: Game }) {
  const account = useOptionalStudentAccount(), sync = useGameSync();
  const frame = useRef<HTMLIFrameElement>(null), shell = useRef<HTMLElement>(null);
  const [channel] = useState(() => crypto.randomUUID());
  const [published, setPublished] = useState(false);
  const [full, setFull] = useState(false);
  const [notice, setNotice] = useState('正在核對題庫版本…');
  const live = useRef({ account, sync, published }); live.current = { account, sync, published };
  const url = new URL(game.url); url.searchParams.set('hqChannel', channel);
  const origin = url.origin;
  useEffect(() => {
    const changed = () => setFull(document.fullscreenElement === shell.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  async function toggleFullscreen() {
    if (document.fullscreenElement === shell.current) { await document.exitFullscreen(); return; }
    if (!shell.current?.requestFullscreen) throw new Error('Fullscreen unavailable');
    await shell.current.requestFullscreen();
  }
  useEffect(() => {
    if (!account) return;
    return onSnapshot(versionRef(game), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      const enabled = snapshot.exists() && snapshot.data().enabled === true;
      setPublished(enabled); setNotice(enabled ? '' : '此版本尚未啟用，請老師先在遊戲紀錄頁同步題庫。');
    }, () => { setPublished(false); setNotice('題庫核對失敗，請檢查連線並重新登入。'); });
  }, [account?.user.uid, game.version]);
  useEffect(() => {
    let verified = false;
    function post(data: object) { frame.current?.contentWindow?.postMessage({ protocol: 'history-game/1', channel, ...data }, origin); }
    function identify() {
      const { account: a, sync: s, published: p } = live.current;
      if (!verified || !a || !s?.authorized || !p) { post({ type: 'locked' }); return; }
      post({ type: 'identity', identity: { scope: `${encodeURIComponent(a.user.uid)}:${encodeURIComponent(a.studentId)}`, name: a.profile?.name || a.studentId } });
    }
    function receive(event: MessageEvent) {
      const d = event.data;
      if (event.source !== frame.current?.contentWindow || event.origin !== origin || !d || d.protocol !== 'history-game/1' || d.channel !== channel || d.gameId !== game.gameId) return;
      if (d.version !== game.version) { verified = false; post({ type: 'locked' }); setNotice('遊戲與題庫版本不同，請重新載入；若仍失敗請聯絡老師。'); return; }
      if (d.type === 'hello') { verified = true; identify(); }
      if (verified && d.type === 'fullscreen') {
        void toggleFullscreen().catch(() => { setNotice('此瀏覽器未能全螢幕，可用新分頁開啟或加入主畫面。'); post({ type: 'fullscreen-unavailable' }); });
      }
      if (verified && d.type === 'event' && live.current.published && live.current.sync?.enqueue(game.gameId, game.version, d.event)) post({ type: 'accepted', eventId: d.event.eventId });
    }
    window.addEventListener('message', receive);
    const interval = setInterval(identify, 3000);
    return () => { post({ type: 'locked' }); clearInterval(interval); window.removeEventListener('message', receive); };
  }, [channel, game.gameId, game.version, origin]);
  if (!account || !sync) return <a className="pixel-button pixel-button-teal" href={gameEntry(game.gameId)}>登入探索館後開始遊戲</a>;
  return <section ref={shell} className="my-4 bg-paper p-3" style={{ overflow: 'auto' }} aria-label="已連結探索館的遊戲">
    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
      <strong>已連結：{account.profile?.name || account.studentId}（{account.profile?.className} {account.profile?.studentNo}）</strong>
      <span role="status" aria-live="polite">{sync.message}</span>
      <button className="pixel-button pixel-button-paper" onClick={sync.retry}>重試同步</button>
      <button className="pixel-button pixel-button-paper" onClick={() => { void toggleFullscreen().catch(() => setNotice('此瀏覽器未能全螢幕，請用新分頁開啟。')); }}>{full ? '退出全螢幕' : '全螢幕'}</button>
      <a className="pixel-button pixel-button-teal" href={gameEntry(game.gameId)} target="_blank" rel="noopener noreferrer">新分頁遊玩</a>
      <a className="pixel-button pixel-button-paper" href={`${import.meta.env.BASE_URL}?gameRecords=1`} target="_blank" rel="noopener noreferrer">各局紀錄與錯題</a>
    </div>
    {notice && <p role="alert" className="my-3">{notice}</p>}
    <p className="mb-2 text-sm">成功完成一局後保存摘要與該局曾答錯的題目。待同步時請保留瀏覽器資料；共用裝置用完請登出。</p>
    {published && sync.authorized && <iframe ref={frame} src={url.href} title={game.title} className="w-full border-0" style={{ height: full ? 'calc(100dvh - 145px)' : 'min(78dvh, 820px)', minHeight: 360 }} allow="autoplay; fullscreen" allowFullScreen sandbox="allow-scripts allow-same-origin allow-pointer-lock" />}
  </section>;
}

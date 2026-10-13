// 執行：node test.mjs   用 setup.sql 裡的真實種子資料驗證「現在／下一場」判斷
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './agenda.js';

const sql = readFileSync(new URL('./setup.sql', import.meta.url), 'utf8');
const sessions = JSON.parse(sql.slice(sql.indexOf("'[\n") + 1, sql.indexOf("'::jsonb")));
const at = t => Agenda.nowNext(sessions, new Date(`2026-10-14T${t}`));

let r = at('15:20');
assert.deepEqual(r.current.map(s => s.room), ['A 會議室']);
assert.equal(r.next.start, '16:00');
assert.equal(r.next.room, 'DE 會議室');

r = at('12:30');
assert.equal(r.current.length, 0);
assert.equal(r.next.start, '13:00');
assert.equal(r.next.room, '607+608 會議室');

r = at('15:45'); // 結束時間那一刻已不算進行中
assert.equal(r.current.length, 0);
assert.equal(r.next.start, '16:00');

r = at('10:10');
assert.equal(r.current[0].start, '10:10');

r = at('18:00');
assert.equal(r.current.length, 0);
assert.equal(r.next, undefined);
assert.ok(sessions.every(s => Agenda.isPast(s, new Date('2026-10-14T18:00'))));

r = Agenda.nowNext(sessions, new Date('2026-10-13T20:00')); // 前一天
assert.equal(r.next.start, '10:10');

const confs = [
  { name: 'empty', sessions: [] },
  { name: 'past', sessions: [{ date: '2026-03-01', start: '10:00', end: '11:00' }] },
  { name: 'hwdc', sessions },
  { name: 'future', sessions: [{ date: '2026-12-01', start: '10:00', end: '11:00' }] },
];
assert.equal(Agenda.closest(confs, new Date('2026-10-13T20:00')).name, 'hwdc');
assert.equal(Agenda.closest(confs, new Date('2026-11-20T09:00')).name, 'future');
assert.equal(Agenda.closest([confs[0]], new Date()).name, 'empty');

// 官網文字解析：格式照 HWDC 2026 議程頁整頁複製的樣子（節錄）
const page = `AGENDA
議程表
10/14(三)10/15(四)
全部AI 如何改變產品規劃與需求定義
10/14(三) 議程表
ABCDEF 會議室
10:10 - 10:55 主題演講
以一些範例來討論AI Coding新時代的團隊開發
陳宜昌 (YC Chen)
Keynote
603+604 會議室
10:10 - 12:10 工作坊
為 Agentic AI 設計前端狀態機與即時回饋介面
何剛 (Michael Ho)
Sunny Wu
10/15(四) 議程表
F 會議室
9:30 - 10:00 分堂議程
早場測試
講者甲
回顧 20252024
Organized by`;
const parsed = Agenda.parseAgenda(page, 2026);
assert.equal(parsed.length, 3);
assert.deepEqual(parsed[0], {
  date: '2026-10-14', start: '10:10', end: '10:55', room: 'ABCDEF 會議室', kind: '主題演講',
  title: '以一些範例來討論AI Coding新時代的團隊開發', speaker: '陳宜昌 (YC Chen)',
});
assert.equal(parsed[1].speaker, '何剛 (Michael Ho)、Sunny Wu'); // 多位講者，不吃到下一天的日期行
assert.equal(parsed[1].room, '603+604 會議室');
assert.deepEqual([parsed[2].date, parsed[2].start, parsed[2].speaker], ['2026-10-15', '09:30', '講者甲']); // 頁尾不算講者
assert.equal(Agenda.parseAgenda('隨便一段文字', 2026).length, 0);

// 官網卡片 HTML → 每場連結。同標題在 10:10 與 15:30 各開一次，要靠開始時間分開
const card = (href, room, time, kind, title, who) =>
  `<div class="item-card"><a href="${href}"></a><div class="item-head">${room}</div><div class="item-content">` +
  `<span>${time} ${kind}</span><h5>${title}</h5><div>${who}</div></div></div>`;
const html = `<a href="/2026/speaker">講者</a>` +
  card('/2026/lab/4990', '605+606 會議室', '10:10 - 12:10', '工作坊', 'AI 時代下,軟體團隊要怎麼設計?', '柯仁傑') +
  card('/2026/session/4971', 'A 會議室', '11:15 - 12:00', '分堂議程', '當 AI 開始調查事故：讓 Kubernetes &amp; 告警', 'Duo') +
  card('https://hwdc.ithome.com.tw/2026/lab/5010', '605+606 會議室', '15:30 - 17:30', '工作坊', 'AI 時代下,軟體團隊要怎麼設計?', '柯仁傑');
const day2 = [
  { date: '2026-10-15', start: '10:10', end: '12:10', room: '605+606 會議室', title: 'AI 時代下,軟體團隊要怎麼設計?' },
  { date: '2026-10-15', start: '11:15', end: '12:00', room: 'A 會議室', title: '當 AI 開始調查事故：讓 Kubernetes & 告警' },
  { date: '2026-10-15', start: '15:30', end: '17:30', room: '605+606 會議室', title: 'AI 時代下,軟體團隊要怎麼設計?' },
  { date: '2026-10-15', start: '17:00', end: '17:30', room: 'F 會議室', title: '官網沒有這場' },
];
const linked = Agenda.attachLinks(day2, html, 'https://hwdc.ithome.com.tw/2026/agenda');
assert.deepEqual(linked.map(s => s.url), [
  'https://hwdc.ithome.com.tw/2026/lab/4990',     // 工作坊（相對路徑補成完整網址）
  'https://hwdc.ithome.com.tw/2026/session/4971', // 分堂議程（標題含 &amp;）
  'https://hwdc.ithome.com.tw/2026/lab/5010',     // 同標題、不同時段
  undefined,                                     // 對不到就不加
]);
assert.equal(Agenda.attachLinks(day2, '', 'https://x').filter(s => s.url).length, 0); // 沒有網頁格式時照常

console.log('ok');

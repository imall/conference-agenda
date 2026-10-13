// 「現在／下一場」判斷。瀏覽器與 node（test.mjs）共用，所以掛在 globalThis 上。
// 時間一律當作裝置本地時間：new Date('2026-10-14T15:20') 不帶時區即為本地時間。
globalThis.Agenda = {
  start: s => new Date(`${s.date}T${s.start}`),
  end: s => new Date(`${s.date}T${s.end}`),

  sortSessions(sessions) {
    return [...sessions].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  },

  // current：進行中的場次（可能多場重疊）；next：之後第一場開始的場次（沒有則 undefined）
  nowNext(sessions, now) {
    const sorted = Agenda.sortSessions(sessions);
    return {
      current: sorted.filter(s => Agenda.start(s) <= now && now < Agenda.end(s)),
      next: sorted.find(s => Agenda.start(s) > now),
    };
  },

  isPast: (s, now) => Agenda.end(s) <= now,

  // 解析 iThome 研討會議程頁整頁複製的文字。每場的格式是：
  //   會議室 / HH:MM - HH:MM 類型 / 標題 / 講者（0~多行）
  // 日期取自前面最近一行「10/14(三)」（同一行有兩個日期的是分頁籤，略過）。
  parseAgenda(text, year) {
    const TIME = /^(\d{1,2}:\d{2})\s*[-–~～]\s*(\d{1,2}:\d{2})\s*(.*)$/;
    const DATE = /^(\d{1,2})\/(\d{1,2})\s*[(（][一二三四五六日][)）]/;
    const STOP = /回顧|Organized by|Copyright|客服資訊/;
    const pad = t => t.padStart(5, '0');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const isDate = l => DATE.test(l) && (l.match(/\d{1,2}\/\d{1,2}/g) || []).length === 1;
    const timeIdx = lines.flatMap((l, i) => TIME.test(l) ? [i] : []);

    const out = [];
    let date = null;
    let scanned = 0;
    timeIdx.forEach((i, k) => {
      for (; scanned < i; scanned++) {
        const m = isDate(lines[scanned]) && lines[scanned].match(DATE);
        if (m) date = `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      }
      const [, start, end, kind] = lines[i].match(TIME);
      // ponytail: 講者 = 標題後到下一場會議室前的行；最後一場最多抓 3 行，遇到頁尾字樣就停
      const stopAt = k + 1 < timeIdx.length ? timeIdx[k + 1] - 1 : i + 5;
      const speakers = [];
      for (let j = i + 2; j < Math.min(stopAt, lines.length); j++) {
        if (STOP.test(lines[j]) || isDate(lines[j])) break;
        if (!/^keynote$/i.test(lines[j])) speakers.push(lines[j]);
      }
      if (date && i > 0 && lines[i + 1])
        out.push({ date, start: pad(start), end: pad(end), room: lines[i - 1], title: lines[i + 1], speaker: speakers.join('、'), kind: kind.trim() });
    });
    return out;
  },

  // 從整頁複製時剪貼簿裡的網頁格式（HTML）找出每場的介紹頁連結，回傳加上 url 的新陣列。
  // iThome 每張卡片是 <a href="/2026/session/4971"></a> 後面接會議室、時間、標題，
  // 所以把 HTML 依 <a 切段，同一段裡「標題相同且開始時間相同」就是那一場（同標題可能在不同時段重複開）。
  attachLinks(sessions, html, baseUrl) {
    const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    const chunks = html.split(/<a\s/i).slice(1).map(c => {
      const href = c.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
      const text = decode(c.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
      const start = text.match(/(\d{1,2}:\d{2})\s*[-–~～]/)?.[1]?.padStart(5, '0');
      let url = null;
      try { url = href && new URL(decode(href), baseUrl).href; } catch {}
      return { url, text, start };
    }).filter(c => /^https?:/.test(c.url)); // 只收網頁連結，擋掉 javascript: 之類
    return sessions.map(s => {
      const hit = chunks.find(c => c.start === s.start && c.text.includes(s.title));
      return hit ? { ...s, url: hit.url } : s;
    });
  },

  // 場次日期離 now 最近的研討會；沒有場次的研討會排最後
  closest(conferences, now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dist = c => Math.min(...c.sessions.map(s => Math.abs(new Date(`${s.date}T00:00`) - today)));
    return [...conferences].sort((a, b) => dist(a) - dist(b))[0];
  },
};

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

  // 場次日期離 now 最近的研討會；沒有場次的研討會排最後
  closest(conferences, now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dist = c => Math.min(...c.sessions.map(s => Math.abs(new Date(`${s.date}T00:00`) - today)));
    return [...conferences].sort((a, b) => dist(a) - dist(b))[0];
  },
};

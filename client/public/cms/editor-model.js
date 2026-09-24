/* Shared CMS model: groups are an editing view; repository JSON stays flat. */
(() => {
  const groups = {
    basics: [
      "description",
      "type",
      "label",
      "duration",
      "difficulty",
      "accent",
    ],
    cover: ["image", "imagePosition"],
    content: ["article", "videoUrl", "gameUrl"],
    assessment: ["questions"],
    publishing: ["visible", "featured", "order"],
  };
  function flatten(input) {
    const data = { ...input };
    for (const [group, keys] of Object.entries(groups)) {
      if (data[group])
        for (const key of keys) {
          if (Object.hasOwn(data[group], key)) data[key] = data[group][key];
        }
      delete data[group];
    }
    for (const key of Object.keys(data))
      if (key.startsWith("_")) delete data[key];
    return data;
  }
  function group(input) {
    const data = flatten(input);
    for (const [name, keys] of Object.entries(groups)) {
      data[name] = {};
      for (const key of keys)
        if (Object.hasOwn(data, key)) {
          data[name][key] = data[key];
          delete data[key];
        }
    }
    return data;
  }
  const present = v => typeof v === "string" && !!v.trim();
  const https = v => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  };
  function issues(input, kind = "tasks") {
    const d = flatten(input),
      errors = [];
    const need = (key, label) => {
      if (!present(d[key])) errors.push(`請填寫${label}。`);
    };
    const image = (key, label) => {
      need(key, label);
      if (
        d[key] &&
        !https(d[key]) &&
        !/^\/history-quest\/uploads\//.test(d[key]) &&
        !/^blob:/.test(d[key])
      )
        errors.push(`${label}需使用 HTTPS 或上載圖片。`);
    };
    need("title", "標題");
    if (kind === "site") {
      image("hero", "首頁大圖");
      image("logo", "網站標誌");
      need("heroAlt", "大圖文字描述");
      for (const key of [
        "subtitle",
        "englishTitle",
        "studentHeading",
        "featuredHeading",
        "allHeading",
        "emptyMessage",
        "dailyLabel",
        "dailyText",
        "encouragement",
      ])
        need(key, `首頁欄位 ${key}`);
      for (const key of ["showTopicCards", "showDaily", "showStats"])
        if (typeof d[key] !== "boolean")
          errors.push(`首頁開關 ${key} 不正確。`);
      return errors;
    }
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(d.task_id || ""))
      errors.push("任務識別碼須為 3–80 個英文字母、數字、底線或連字號。");
    need("topicId", "所屬課題");
    need("description", "卡片簡介");
    need("article", "教材內容");
    image("image", "封面圖片");
    need("label", "漫畫標籤");
    if (!["teal", "red", "gold"].includes(d.accent))
      errors.push("請選擇功能色。");
    if (typeof d.visible !== "boolean" || typeof d.featured !== "boolean")
      errors.push("請設定公開顯示及首頁精選開關。");
    if (!["article", "quiz", "game"].includes(d.type))
      errors.push("請選擇任務類型。");
    if (!Number.isInteger(d.duration) || d.duration < 1 || d.duration > 180)
      errors.push("建議時間須為 1–180 分鐘。");
    if (!Number.isInteger(d.difficulty) || d.difficulty < 1 || d.difficulty > 5)
      errors.push("難度須為 1–5。");
    if (!Number.isInteger(d.order) || d.order < 0)
      errors.push("顯示次序須為非負整數。");
    if (d.gameUrl && !https(d.gameUrl)) errors.push("遊戲連結必須使用 HTTPS。");
    if (d.videoUrl) {
      let valid = false;
      try {
        const u = new URL(d.videoUrl),
          host = u.hostname.replace(/^www\./, "");
        valid =
          u.protocol === "https:" &&
          ((["youtube.com", "m.youtube.com"].includes(host) &&
            (u.searchParams.has("v") ||
              /^\/(embed|shorts)\/[^/]+/.test(u.pathname))) ||
            (host === "youtu.be" && u.pathname.length > 1) ||
            (host === "drive.google.com" &&
              /^\/file\/d\/[^/]+/.test(u.pathname)));
      } catch {
        /* Invalid URL. */
      }
      if (!valid)
        errors.push("影片連結需為有效的 YouTube 或 Google Drive 檔案網址。");
    }
    const qs =
      d.questions ||
      (d.question
        ? [{ ...d.question, id: "q1", type: "choice", points: 10 }]
        : []);
    if (!Array.isArray(qs) || !qs.length || qs.length > 30)
      errors.push("請加入 1–30 題測驗。");
    else {
      if (new Set(qs.map(q => q.id)).size !== qs.length)
        errors.push("每題識別碼必須不同。");
      qs.forEach((q, i) => {
        const prefix = `第 ${i + 1} 題：`;
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(q.id || ""))
          errors.push(prefix + "題目識別碼不正確。");
        if (!present(q.prompt) || !present(q.explanation))
          errors.push(prefix + "請填寫題目與解說。");
        if (!Number.isInteger(q.points) || q.points < 1 || q.points > 100)
          errors.push(prefix + "分數須為 1–100。");
        if (!["choice", "short"].includes(q.type))
          errors.push(prefix + "題型不正確。");
        if (
          q.type === "choice" &&
          (!Array.isArray(q.options) ||
            q.options.length < 2 ||
            q.options.length > 6 ||
            q.options.some(o => !present(o)) ||
            !Number.isInteger(q.answer) ||
            q.answer < 0 ||
            q.answer >= q.options.length)
        )
          errors.push(prefix + "選項須有 2–6 個，答案序號須在選項範圍內。");
      });
    }
    return errors;
  }
  function restore(current, backup, kind) {
    if (!backup || typeof backup !== "object" || Array.isArray(backup))
      throw new Error("備份不是有效的內容 JSON。");
    const d = flatten(backup);
    if (kind === "tasks" && d.task_id !== flatten(current).task_id)
      throw new Error("只能還原相同任務識別碼的備份。");
    const errors = issues(d, kind);
    if (errors.length) throw new Error(errors.join("\n"));
    return d;
  }
  globalThis.HQEditor = { groups, flatten, group, issues, restore };
})();

/* global CMS, createClass, h, HQEditor */
(() => {
  const base = new URL("../", location.href);
  const repository = "https://github.com/kitlung1107/history-quest";
  const plain = entry => entry.get("data").toJS();
  const effective = entry => {
    const d = plain(entry);
    return HQEditor.flatten(d._tools?.restore || d);
  };
  HQEditor.effective = effective;
  CMS.registerCustomFormat("hq-task-json", "json", {
    fromFile: text => HQEditor.group(JSON.parse(text)),
    toFile: data => JSON.stringify(HQEditor.flatten(data), null, 2) + "\n",
  });
  let catalogue;
  const loadCatalogue = () =>
    (catalogue ||= fetch(new URL("cms/content-index.json", base), {
      cache: "no-cache",
    })
      .then(r => {
        if (!r.ok) throw new Error("目錄尚未建立");
        return r.json();
      })
      .catch(e => {
        catalogue = undefined;
        throw e;
      }));
  const Audit = createClass({
    getInitialState() {
      return { entries: null, error: "", size: null };
    },
    componentDidMount() {
      this.active = true;
      loadCatalogue()
        .then(index => {
          if (this.active) this.setState({ entries: index });
        })
        .catch(() => {
          if (this.active)
            this.setState({ error: "使用目錄未能載入，請重新整理。" });
        });
    },
    componentWillUnmount() {
      this.active = false;
    },
    render() {
      const d = effective(this.props.entry);
      const source =
        this.props.source || this.props.field?.get("source") || "image";
      const src = d[source];
      if (!src) return h("p", {}, "選擇圖片後會顯示尺寸及使用位置。");
      const url = src.startsWith("/history-quest/")
        ? new URL(src.slice(15), base).href
        : src;
      const size = this.state.size?.src === src ? this.state.size : null;
      const uses = this.state.entries?.images?.[src] || [];
      return h(
        "div",
        { style: { marginTop: 12, padding: 12, border: "1px solid #aaa" } },
        h("img", {
          key: src,
          src: url,
          alt: "圖片品質檢查",
          style: { width: 100, height: 70, objectFit: "contain" },
          onLoad: e =>
            this.setState({
              size: {
                src,
                width: e.target.naturalWidth,
                height: e.target.naturalHeight,
              },
            }),
          onError: () => this.setState({ size: { src, failed: true } }),
        }),
        size?.failed
          ? h(
              "p",
              { role: "alert" },
              "圖片無法載入，請檢查連結或先儲存新上載圖片。"
            )
          : size &&
              h(
                "p",
                {},
                `${size.width} × ${size.height} 像素${size.width < 800 ? " · 解像度偏低，放大可能模糊" : ""}${size.width * size.height > 16000000 ? " · 尺寸很大，建議先縮小以加快載入" : ""}`
              ),
        h("p", {}, "使用位置（上次建置內容；未儲存草稿不包括在內）："),
        this.state.error
          ? h("p", { role: "status" }, this.state.error)
          : !this.state.entries
            ? h("p", {}, "正在讀取…")
            : uses.length
              ? h(
                  "ul",
                  {},
                  ...uses.map((label, i) => h("li", { key: i }, label))
                )
              : h("p", {}, "尚未在已建置內容中使用。"),
        h(
          "small",
          {},
          "外部圖片的檔案大小不一定可讀取；上載時另有限制檔案大小。"
        )
      );
    },
  });
  CMS.registerWidget("image-audit", Audit);
  CMS.registerWidget(
    "editor-tools",
    createClass({
      getInitialState() {
        return { error: "", changed: [], index: null };
      },
      componentDidMount() {
        this.active = true;
        loadCatalogue()
          .then(index => {
            if (this.active) this.setState({ index });
          })
          .catch(() => {});
      },
      componentWillUnmount() {
        this.active = false;
      },
      render() {
        const kind = this.props.field.get("kind"),
          data = plain(this.props.entry);
        const current = HQEditor.flatten(data),
          pending = data._tools?.restore;
        const d = pending || current,
          errors = HQEditor.issues(d, kind);
        const topic = this.state.index?.topics.find(t => t.id === d.topicId);
        const path =
          this.props.entry.get("path") ||
          (kind === "site"
            ? "client/src/content/settings/site.json"
            : "client/src/content/tasks");
        const history = `${repository}/commits/main/${path.split("/").map(encodeURIComponent).join("/")}`;
        const saveBackup = () => {
          const blob = new Blob([JSON.stringify(d, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = `${d.task_id || "site"}-backup.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
        return h(
          "section",
          { style: { border: "1px solid #999", padding: 14 } },
          h(
            "strong",
            {},
            errors.length
              ? `發布前檢查：${errors.length} 項待處理`
              : "基本內容檢查通過"
          ),
          errors.length > 0 &&
            h(
              "ul",
              {},
              ...errors.map((error, i) => h("li", { key: i }, error))
            ),
          kind === "tasks" &&
            topic &&
            h(
              "p",
              {},
              `中${topic.grade} · ${topic.title}${!topic.visible || !topic.gradeVisible ? "（課題或年級已隱藏，學生不會看到此任務）" : ""}`
            ),
          h(
            "p",
            {},
            "收合下方分組可快速切換基本資料、封面、教材、測驗及發布設定。連結格式檢查不保證外部網站允許嵌入，請開啟學生預覽確認。"
          ),
          h(
            "a",
            { href: history, target: "_blank", rel: "noopener noreferrer" },
            "查看此教材版本紀錄"
          ),
          " · ",
          h(
            "a",
            {
              href: new URL("library", base).href,
              target: "_blank",
              rel: "noopener noreferrer",
            },
            "教材搜尋與圖片目錄"
          ),
          " · ",
          h(
            "a",
            {
              href: `${repository}/actions`,
              target: "_blank",
              rel: "noopener noreferrer",
            },
            "查看發布進度"
          ),
          h(
            "div",
            { style: { margin: "12px 0" } },
            h(
              "button",
              { type: "button", onClick: saveBackup },
              "下載目前內容備份"
            )
          ),
          h(
            "label",
            {},
            "還原 JSON 備份（先預覽，再按後台儲存）",
            h("input", {
              type: "file",
              disabled: Boolean(this.props.entry.get("newRecord")),
              accept: ".json,application/json",
              style: { display: "block", marginTop: 8 },
              onChange: async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 2000000)
                    throw new Error("備份不可超過 2 MB。");
                  if (this.props.entry.get("newRecord"))
                    throw new Error("請先儲存教材，再還原相同教材的備份。");
                  const restored = HQEditor.restore(
                    current,
                    JSON.parse(await file.text()),
                    kind
                  );
                  const changed = [
                    ...new Set([
                      ...Object.keys(current),
                      ...Object.keys(restored),
                    ]),
                  ].filter(
                    k =>
                      JSON.stringify(current[k]) !== JSON.stringify(restored[k])
                  );
                  this.props.onChange({ restore: restored });
                  this.setState({ changed, error: "" });
                } catch (e) {
                  this.setState({ error: e.message });
                }
              },
            })
          ),
          this.state.error && h("p", { role: "alert" }, this.state.error),
          pending &&
            h(
              "div",
              {
                role: "status",
                style: { padding: 12, background: "#fff1c7", color: "#172a3a" },
              },
              h("strong", {}, "還原待儲存：儲存時會以備份取代這份內容。"),
              h(
                "p",
                {},
                `備份：${pending.title}。請先查看學生預覽；取消還原後才繼續編輯下方欄位。`
              ),
              h(
                "p",
                {},
                `變更欄位：${this.state.changed.join("、") || "與目前內容相同"}`
              ),
              h(
                "button",
                { type: "button", onClick: () => this.props.onChange(null) },
                "取消還原"
              )
            ),
          h(
            "p",
            { style: { fontSize: 13 } },
            "還原用於已儲存教材；如正在編輯未完成草稿，請先用 CMS 的復原變更回到已儲存版本。舊版本可從版本紀錄下載原始 JSON，再於此匯入。還原會保留提交歷史，不會還原或刪除學生成績。"
          ),
          h(Audit, {
            ...this.props,
            source: kind === "site" ? "hero" : "image",
          })
        );
      },
    })
  );
})();

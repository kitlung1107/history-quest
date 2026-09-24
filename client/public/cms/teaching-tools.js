/* global CMS, createClass, h, HQEditor */
(() => {
  const base = new URL("../", location.href);
  function template(kind) {
    return createClass({
      getInitialState() {
        return { token: crypto.randomUUID(), width: "100%" };
      },
      componentDidMount() {
        this.receive = event => {
          if (
            event.origin === location.origin &&
            event.source === this.frame?.contentWindow &&
            event.data?.type === "hq-preview-ready" &&
            event.data.token === this.state.token
          )
            this.sendDraft();
        };
        window.addEventListener("message", this.receive);
        this.sendDraft();
      },
      componentDidUpdate() {
        this.sendDraft();
      },
      componentWillUnmount() {
        window.removeEventListener("message", this.receive);
      },
      sendDraft() {
        const data = HQEditor.effective(this.props.entry);
        for (const key of ["image", "hero", "logo"]) {
          const asset = data[key] && this.props.getAsset?.(data[key]);
          if (asset?.url) data[key] = asset.url;
        }
        this.frame?.contentWindow?.postMessage(
          { type: "hq-preview", token: this.state.token, kind, data },
          location.origin
        );
      },
      render() {
        return h(
          "div",
          {},
          h(
            "label",
            {},
            "預覽寬度 ",
            h(
              "select",
              {
                value: this.state.width,
                onChange: e => this.setState({ width: e.target.value }),
              },
              h("option", { value: "100%" }, "填滿預覽欄"),
              h("option", { value: "390px" }, "手機 390px"),
              h("option", { value: "768px" }, "平板 768px"),
              h("option", { value: "1280px" }, "桌面 1280px")
            )
          ),
          h(
            "div",
            { style: { overflowX: "auto", maxWidth: "100%" } },
            h("iframe", {
              title: "學生畫面即時預覽",
              ref: frame => {
                this.frame = frame;
              },
              onLoad: () => this.sendDraft(),
              src: new URL(`preview#${this.state.token}`, base).href,
              style: {
                width: this.state.width,
                height: "90vh",
                minHeight: 650,
                border: 0,
              },
            })
          )
        );
      },
    });
  }
  CMS.registerPreviewTemplate("tasks", template("tasks"));
  CMS.registerPreviewTemplate("site", template("site"));
  // A normal same-origin iframe also works in browsers that cannot load the
  // CMS preview pane's blob document. This control never changes saved data.
  const SitePreview = template("site");
  const TaskPreview = template("tasks");
  CMS.registerWidget(
    "live-preview",
    createClass({
      getInitialState() {
        return { open: false };
      },
      render() {
        const Preview =
          this.props.field.get("kind") === "site" ? SitePreview : TaskPreview;
        return h(
          "div",
          {},
          h(
            "button",
            {
              type: "button",
              onClick: () => this.setState({ open: !this.state.open }),
              style: { padding: "8px 14px" },
            },
            this.state.open ? "收起學生畫面預覽" : "開啟學生畫面預覽"
          ),
          h(
            "p",
            { style: { fontSize: 13 } },
            "改動即時反映在預覽中；試答不會儲存成績。"
          ),
          this.state.open && h(Preview, this.props)
        );
      },
    })
  );
  CMS.registerEventListener({
    name: "preSave",
    handler: ({ entry }) => {
      const kind =
        entry.get("collection") === "tasks"
          ? "tasks"
          : entry.get("data").get("hero") !== undefined
            ? "site"
            : null;
      if (!kind) return;
      let data = entry.get("data");
      const raw = data.toJS();
      let flat = raw._tools?.restore
        ? HQEditor.restore(raw, raw._tools.restore, kind)
        : HQEditor.flatten(raw);
      const errors = HQEditor.issues(flat, kind);
      if (errors.length) throw new Error(errors.join("\n"));
      if (kind === "site") {
        for (const key of Object.keys(raw)) data = data.delete(key);
        for (const [key, value] of Object.entries(flat))
          data = data.set(key, value);
        return data.delete("_tools").delete("_preview");
      }
      const questions = flat.questions || [];
      if (
        !questions.length ||
        new Set(questions.map(q => q.id)).size !== questions.length
      )
        throw new Error("請加入題目，並確保每題識別碼不同。");
      for (const q of questions)
        if (
          q.type === "choice" &&
          (!Number.isInteger(q.answer) ||
            q.answer < 0 ||
            q.answer >= (q.options?.length || 0))
        )
          throw new Error("選擇題的正確答案序號超出選項範圍。");
      if (entry.get("newRecord")) {
        // Native Duplicate creates a new record. Give it a distinct score identity,
        // and keep the first save hidden until the teacher explicitly publishes it.
        const baseId = String(flat.task_id || "task").slice(0, 60);
        flat = {
          ...flat,
          task_id: `${baseId}_${crypto.randomUUID().slice(0, 8)}`,
          visible: false,
          featured: false,
        };
      }
      const grouped = HQEditor.group(flat);
      for (const key of Object.keys(raw)) data = data.delete(key);
      for (const [key, value] of Object.entries(grouped))
        data = data.set(key, value);
      return data;
    },
  });
  CMS.registerPreviewTemplate(
    "assets",
    createClass({
      render() {
        const data = this.props.entry.get("data").toJS();
        const asset = this.props.getAsset(data.image);
        return h(
          "article",
          { style: { padding: 24, fontFamily: "sans-serif" } },
          h("h1", {}, data.title),
          h("p", {}, data.category),
          h("img", {
            src: asset?.url || data.image,
            alt: data.alt || "",
            style: { maxWidth: "100%" },
          }),
          h("p", {}, data.alt),
          h("p", {}, data.credit),
          h("p", {}, "重用時可在圖片欄位選擇同一檔案，或複製此圖片連結："),
          h("code", {}, data.image)
        );
      },
    })
  );
})();

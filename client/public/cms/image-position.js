/* global CMS, createClass, h */
(() => {
  const clamp = n => typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
  const Control = createClass({
    getInitialState: function () {
      return { ratio: null, loadedSource: "", naturalRatio: 1, failedSource: "" };
    },
    render: function () {
      const { field, entry, value, onChange, forID } = this.props;
      const sourceField = field.get("source");
      const storedSource = entry.getIn(["data", ...sourceField.split(".")]) || "";
      // Match the app's base path in both local previews and GitHub Pages.
      const base = new URL("../", location.href).pathname;
      const src = storedSource.startsWith("/history-quest/")
        ? base + storedSource.slice("/history-quest/".length) : storedSource;
      const position = value?.toJS ? value.toJS() : value;
      const x = clamp(position?.x), y = clamp(position?.y);
      const presets = sourceField === "hero"
        ? [["桌面大圖", 1200 / 285], ["手機大圖", 390 / 280]]
        : [["桌面卡片", 220 / 335], ["手機卡片", 390 / 190], ["任務頁橫幅", 1000 / 300]];
      const ratio = this.state.ratio || presets[0][1];
      const ready = this.state.loadedSource === src;
      const width = Math.min(1, ratio / this.state.naturalRatio);
      const height = Math.min(1, this.state.naturalRatio / ratio);
      const change = (axis, n) => onChange({ x, y, [axis]: clamp(n) });
      const slider = (axis, label, n) => h("label", { style: { display: "block", margin: "12px 0" } },
        `${label}：${n}%`, h("input", {
          id: axis === "x" ? forID : `${forID}-y`, type: "range", min: 0, max: 100, step: 1,
          value: n, disabled: !src, style: { display: "block", width: "100%" },
          onChange: e => change(axis, Number(e.target.value)),
        }));
      return h("div", { style: { padding: 16, border: "1px solid #888", borderRadius: 8 } },
        h("p", {}, "框內為顯示範圍，暗色部分會被裁掉。拖動滑桿調整取景；原圖會完整保留。"),
        h("label", {}, "預覽版面 ", h("select", {
          value: ratio, onChange: e => this.setState({ ratio: Number(e.target.value) }),
        }, ...presets.map(([label, r]) => h("option", { key: label, value: r }, label)))),
        h("p", { style: { fontSize: 13 } }, "以下為常見版面比例示意；實際範圍會隨螢幕寬度和文字長度改變。各版面共用取景位置。"),
        !src ? h("p", {}, "請先在上方選擇圖片。") : h("div", {},
          h("div", { style: { position: "relative", overflow: "hidden", margin: "12px auto", maxWidth: 480 } },
            h("img", { key: src, src, alt: "完整原圖及可見範圍", style: { display: "block", width: "100%", height: "auto" },
              onLoad: e => this.setState({ loadedSource: src, failedSource: "", naturalRatio: e.target.naturalWidth / e.target.naturalHeight }),
              onError: () => this.setState({ loadedSource: "", failedSource: src }),
            }),
            ready && h("div", { style: {
              position: "absolute", pointerEvents: "none", boxSizing: "border-box",
              left: `${(1 - width) * x}%`, top: `${(1 - height) * y}%`,
              width: `${width * 100}%`, height: `${height * 100}%`,
              border: "3px solid #ffd34e", boxShadow: "0 0 0 1000px #0009",
            } })),
          this.state.failedSource === src && h("p", { role: "alert" }, "圖片未能載入，請檢查圖片連結，或儲存上載圖片後重新開啟。"),
          ready && h("div", {}, h("strong", {}, "裁切效果"),
            h("div", { style: { aspectRatio: String(ratio), width: `min(100%, 480px, ${360 * ratio}px)`, margin: "8px auto", overflow: "hidden" } },
              h("img", { src, alt: "調整後的圖片", style: { display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: `${x}% ${y}%` } })))),
        slider("x", "左右位置（左 → 右）", x), slider("y", "上下位置（上 → 下）", y),
        h("button", { type: "button", disabled: !src, onClick: () => onChange({ x: 50, y: 50 }) }, "重設為置中"));
    },
  });
  CMS.registerWidget("image-position", Control);
})();

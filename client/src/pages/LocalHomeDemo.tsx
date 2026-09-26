import { useState } from "react";
import Home from "./Home";
import { ProfileEditor, type CloudProfile } from "@/contexts/StudentAccount";
import { characterKey } from "@/lib/characters";
import { SITE_SETTINGS } from "@/lib/siteSettings";
import "./home-paper-preview.css";

const storageKey = "hdc.local-home-demo.v1";
const example: CloudProfile = {
  className: "3A",
  name: "陳小明（示範）",
  studentNo: "12",
  nickname: "歷史小探員",
  avatar: "studentBoy",
  configured: true,
};

/** Dev-only route, no AccountGate/provider and no cloud writes. Production excludes this module. */
export default function LocalHomeDemo() {
  const [profile, setProfile] = useState<CloudProfile>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      return saved
        ? {
            ...example,
            nickname:
              typeof saved.nickname === "string"
                ? saved.nickname
                : example.nickname,
            avatar: characterKey(saved.avatar),
          }
        : example;
    } catch {
      return example;
    }
  });
  const [editing, setEditing] = useState(false);
  const [corners, setCorners] = useState(() => new URLSearchParams(location.search).get("corners") === "round" ? "round" : "square");
  const edgePreview = new URLSearchParams(location.search).get("hero") === "edge";
  function selectCorners(value: string) {
    const url = new URL(location.href);
    url.searchParams.set("corners", value);
    history.replaceState(null, "", url);
    setCorners(value);
  }
  const [paper, setPaper] = useState(() => {
    const value = new URLSearchParams(location.search).get("background");
    return value && ["A", "C", "E", "F", "G"].includes(value) ? value : "original";
  });
  function selectPaper(value: string) {
    const url = new URL(location.href);
    if (value === "original") url.searchParams.delete("background");
    else url.searchParams.set("background", value);
    history.replaceState(null, "", url);
    setPaper(value);
  }
  return (
    <div className="home-paper-preview" data-paper={paper} data-corners={corners}
      data-hero={edgePreview ? "edge" : "original"}>
      <div className="demo-notice">
        本機示範帳戶 · 教材唯讀預覽 · 角色只儲存於此瀏覽器
      </div>
      <nav className="paper-preview-controls" aria-label="首頁底紙比較">
        <span>首頁底紙比較</span>
        {[["original", "原版"], ["A", "A · 柔和米色紙"], ["C", "C · 暖白方格紙"], ["E", "E · 天空延伸"], ["F", "F · 漫畫畫冊"], ["G", "G · 探險地圖"]].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={paper === value}
            onClick={() => selectPaper(value)}>{label}</button>
        ))}
        <small>僅供預覽，未套用正式首頁</small>
        {edgePreview && <div className="hero-corner-controls" role="group" aria-label="主圖角形比較">
          <span>窄白邊主圖</span>
          <button type="button" aria-pressed={corners === "square"} onClick={() => selectCorners("square")}>直角</button>
          <button type="button" aria-pressed={corners === "round"} onClick={() => selectCorners("round")}>圓角</button>
        </div>}
      </nav>
      {editing ? (
        <ProfileEditor
          initialProfile={profile}
          email="demo@example.test"
          onCancel={() => setEditing(false)}
          onSave={async next => {
            localStorage.setItem(
              storageKey,
              JSON.stringify({ nickname: next.nickname, avatar: next.avatar })
            );
            setProfile(next);
            setEditing(false);
          }}
        />
      ) : (
        <Home
          previewSettings={SITE_SETTINGS}
          previewProfile={profile}
          onChangeCharacter={() => setEditing(true)}
        />
      )}
    </div>
  );
}

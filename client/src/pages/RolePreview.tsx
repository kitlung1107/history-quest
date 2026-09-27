import { useState } from "react";
import { ProfileEditor, type CloudProfile } from "@/contexts/StudentAccount";
import Home from "./Home";
import { SITE_SETTINGS } from "@/lib/siteSettings";
import { isStudentRole } from "@/lib/cardModel";
const key = "hdc.role-preview.v1";
const fresh = (className = "1A", legacy = false): CloudProfile => ({
  className,
  studentNo: "12",
  name: "可豪",
  nickname: "歷史小探員",
  avatar: "explorer",
  configured: legacy,
  ...(legacy ? { cardId: "nile-explorer-girl" } : {}),
});
export default function RolePreview() {
  const [profile, setProfile] = useState<CloudProfile>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || fresh();
    } catch {
      return fresh();
    }
  });
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  function save(next: CloudProfile) {
    localStorage.setItem(key, JSON.stringify(next));
    setProfile(next);
    setRevision(v => v + 1);
  }
  return (
    <div className="paper-texture min-h-screen">
      <div
        className="bg-gold p-4 flex flex-wrap items-center gap-3"
        aria-label="展示帳戶控制"
      >
        <strong>本機展示帳戶 · 不會改動真實學生資料</strong>
        <label>
          示範年級{" "}
          <select
            aria-label="示範年級"
            className="comic-input"
            value={profile.className}
            onChange={e => {
              save(fresh(e.target.value));
              setEditing(false);
            }}
          >
            {["1A", "2A", "3A", "S4", "S5", "S6"].map((c, i) => (
              <option value={c} key={c}>
                中{i + 1}
              </option>
            ))}
          </select>
        </label>
        <button
          className="pixel-button pixel-button-paper"
          onClick={() => {
            save(fresh(profile.className));
            setEditing(false);
          }}
        >
          重設新帳戶
        </button>
        <button
          className="pixel-button pixel-button-paper"
          onClick={() => {
            save(fresh(profile.className, true));
            setEditing(false);
          }}
        >
          測試舊帳戶
        </button>
        <button
          className="pixel-button pixel-button-paper"
          onClick={() => location.reload()}
        >
          模擬重新登入
        </button>
        <button
          className="pixel-button pixel-button-paper"
          onClick={() =>
            save({
              ...profile,
              name: "陳可豪Alexander歷史探索示範學生甲乙丙丁戊己庚辛壬癸",
              nickname: "星海航路歷史探索小隊超長暱稱測試",
            })
          }
        >
          測試長姓名與暱稱
        </button>
      </div>
      {!isStudentRole(profile.role) || editing ? (
        <ProfileEditor
          key={revision}
          initialProfile={profile}
          email="demo@example.test"
          onCancel={
            isStudentRole(profile.role) ? () => setEditing(false) : undefined
          }
          onSave={async next => {
            save(next);
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

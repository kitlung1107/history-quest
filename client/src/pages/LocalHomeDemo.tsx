import { useState } from "react";
import Home from "./Home";
import { ProfileEditor, type CloudProfile } from "@/contexts/StudentAccount";
import { characterKey } from "@/lib/characters";
import { SITE_SETTINGS } from "@/lib/siteSettings";

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
  return (
    <>
      <div className="demo-notice">
        本機示範帳戶 · 教材唯讀預覽 · 角色只儲存於此瀏覽器
      </div>
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
    </>
  );
}

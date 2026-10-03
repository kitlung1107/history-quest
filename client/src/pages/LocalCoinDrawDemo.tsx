import Home from "./Home";
import { SITE_SETTINGS } from "@/lib/siteSettings";
import type { CloudProfile } from "@/contexts/StudentAccount";

const profile: CloudProfile = {
  className: "3A", name: "陳小明（示範）", studentNo: "12", nickname: "歷史小探險",
  avatar: "studentBoy", role: "studentBoy", configured: true,
  ownedCardIds: ["starter-explorer-boy"], cardId: "starter-explorer-boy",
};

/** Development-only UI route. It does not mount an account provider or mock a wallet. */
export default function LocalCoinDrawDemo() {
  const query = new URLSearchParams(location.search);
  return <Home previewSettings={SITE_SETTINGS} previewProfile={profile}
    coinDrawDemo={query.get("mode") !== "unavailable"}
    initialCoinDrawOpen={query.get("view") !== "home"}
    initialSidebarOpen onChangeCharacter={() => {}} />;
}

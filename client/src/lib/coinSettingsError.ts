export function coinSettingsError(error: unknown, project: string): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^firestore\//, "") : "unknown";
  const detail = code === "permission-denied"
    ? "權限被拒絕：請確認使用教師帳戶，並檢查此 Firebase 專案已發布容許教師存取 coinRules 嘅 Firestore 規則。重新啟動唔會修正權限。"
    : code === "unauthenticated"
      ? "登入憑證無效，請重新登入教師帳戶。"
      : ["unavailable", "deadline-exceeded"].includes(code)
        ? "暫時連唔到伺服器，請檢查網絡後按「重試讀取設定」。"
        : "讀取設定失敗，請按「重試讀取設定」；如持續失敗，請提供以下錯誤代碼畀管理員。";
  return `未能讀取探索幣設定。${detail}（${code}；專案：${project}）`;
}

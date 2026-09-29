import { BookOpen, Gamepad2, ClipboardList } from "lucide-react";

const types = {
  article: { label: "文章閱讀", Icon: BookOpen },
  game: { label: "互動遊戲", Icon: Gamepad2 },
  quiz: { label: "小測驗", Icon: ClipboardList },
};

export default function TaskTypeLabel({ type }: { type: keyof typeof types }) {
  const { label, Icon } = types[type];
  return (
    <>
      <Icon aria-hidden="true" className="h-4 w-4" />
      {label}
    </>
  );
}

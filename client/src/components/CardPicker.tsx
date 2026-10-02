import { EXPLORER_CARDS } from "@/lib/cards";
import { type CardCollection } from "@/lib/cardModel";
import { availableAccountCards } from "@/lib/fullCardAccess";
import { mediaUrl } from "@/lib/siteSettings";
export default function CardPicker({
  value,
  collection,
  fullCardAccess = false,
  onChange,
}: {
  value?: string;
  collection: CardCollection;
  fullCardAccess?: boolean;
  onChange: (id: string) => void;
}) {
  const cards = availableAccountCards(EXPLORER_CARDS, collection, fullCardAccess);
  const locked = EXPLORER_CARDS.filter(
    c =>
      !fullCardAccess && c.enabled &&
      c.role === collection.role &&
      !collection.ownedCardIds?.includes(c.id)
  );
  return (
    <fieldset className="card-picker">
      <legend>我的收藏卡</legend>
      <p className="mb-3 text-sm">
        更換展示卡不會改變角色。選卡後按「儲存卡片」。
      </p>
      {fullCardAccess && <p className="mb-3 text-sm">此帳號可使用所有已啟用卡片，包括男、女角色卡。</p>}
      {!cards.length && <p role="status">{fullCardAccess ? "暫時沒有已啟用的卡片。" : "請先選擇角色。"}</p>}
      <div className="card-picker-grid">
        {cards.map(card => (
          <label
            key={card.id}
            className={`card-choice ${value === card.id ? "selected" : ""}`}
          >
            <input
              type="radio"
              name="cardId"
              value={card.id}
              checked={value === card.id}
              onChange={() => onChange(card.id)}
            />
            <img src={mediaUrl(card.image)} alt="" />
            <span>{card.name} · {fullCardAccess ? "可使用" : "已擁有"}</span>
          </label>
        ))}
      </div>
      {locked.map(card => (
        <p className="my-3" key={card.id}>
          {card.name} · 未擁有（其他獲得方式尚未開放）
        </p>
      ))}
    </fieldset>
  );
}

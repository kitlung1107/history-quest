import { EXPLORER_CARDS } from "@/lib/cards";
import { availableCards, type CardCollection } from "@/lib/cardModel";
import { mediaUrl } from "@/lib/siteSettings";
export default function CardPicker({
  value,
  collection,
  onChange,
}: {
  value?: string;
  collection: CardCollection;
  onChange: (id: string) => void;
}) {
  const cards = availableCards(EXPLORER_CARDS, collection);
  const locked = EXPLORER_CARDS.filter(
    c =>
      c.enabled &&
      c.role === collection.role &&
      !collection.ownedCardIds?.includes(c.id)
  );
  return (
    <fieldset className="card-picker">
      <legend>我的收藏卡</legend>
      <p className="mb-3 text-sm">
        更換展示卡不會改變角色。選卡後按「儲存卡片」。
      </p>
      {!cards.length && <p role="status">請先選擇角色。</p>}
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
            <span>{card.name} · 已擁有</span>
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

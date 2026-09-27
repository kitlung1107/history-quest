import { EXPLORER_CARDS } from "@/lib/cards";
import { availableCards, resolveCard } from "@/lib/cardModel";
import { mediaUrl } from "@/lib/siteSettings";
export default function CardPicker({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const cards = availableCards(EXPLORER_CARDS);
  const selected = resolveCard(EXPLORER_CARDS, value);
  return <fieldset className="card-picker"><legend>選擇收藏卡</legend>
    <p className="mb-3 text-sm">選卡後按「儲存卡片」；班別、姓名及學號不會改變。</p>
    {!cards.length && <p role="status">暫時沒有可用卡片，仍可修改暱稱。</p>}
    <div className="card-picker-grid">{cards.map(card => <label key={card.id} className={`card-choice ${selected?.id === card.id ? "selected" : ""}`}>
      <input type="radio" name="cardId" value={card.id} checked={selected?.id === card.id} onChange={() => onChange(card.id)} />
      <img src={mediaUrl(card.image)} alt="" /><span>{card.name}</span>
    </label>)}</div>
  </fieldset>;
}

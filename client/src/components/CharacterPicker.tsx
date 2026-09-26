import {
  CHARACTERS,
  characterImage,
  type CharacterKey,
} from "@/lib/characters";

export default function CharacterPicker({
  value,
  onChange,
}: {
  value: CharacterKey;
  onChange: (key: CharacterKey) => void;
}) {
  return (
    <fieldset className="character-picker">
      <legend>選擇角色</legend>
      <div className="character-grid">
        {Object.entries(CHARACTERS).map(([key, character]) => (
          <label
            key={key}
            className={`character-option ${value === key ? "is-selected" : ""}`}
          >
            <input
              type="radio"
              name="avatar"
              aria-label={character.name}
              value={key}
              checked={value === key}
              onChange={() => onChange(key as CharacterKey)}
            />
            <img src={characterImage(key)} alt="" width="160" height="190" />
            <span>{character.name}</span>
            {value === key && <small>已選擇</small>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

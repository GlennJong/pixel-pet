import { useState } from "react";

function AutoSaveTrigger() {
  const [isAutoSaved, setIsAutoSaved] = useState<boolean>(() => {
    const saved = localStorage.getItem("isEnableAutoSave");
    return saved === "true";
  });
  const isSavedExisted = !!localStorage.getItem("pet_store");

  const handleAutoSaveChange = () => {
    const next = !isAutoSaved;
    setIsAutoSaved(next);
    localStorage.setItem("isEnableAutoSave", String(next));
  };

  const handleClickClearLocalStorage = () => {
    localStorage.removeItem("pet_store");
  };

  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <input
          type="checkbox"
          checked={isAutoSaved}
          onChange={handleAutoSaveChange}
        />
        <span>Auto Save</span>
      </label>
      {!isAutoSaved && isSavedExisted && (
        <button onClick={handleClickClearLocalStorage}>Clear</button>
      )}
    </div>
  );
}

export default AutoSaveTrigger;

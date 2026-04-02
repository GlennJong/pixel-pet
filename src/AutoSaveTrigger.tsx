import { useState } from "react";
import {
  clearAllRuntimeDataFromLocalStorage,
  getIsAutoSaveEnabled,
  hasSaveData,
  setIsAutoSaveEnabled,
} from "./game/runtimeData";

function AutoSaveTrigger() {
  const [isAutoSaved, setLocalIsAutoSaved] =
    useState<boolean>(getIsAutoSaveEnabled);
  const [saveExists, setSaveExists] = useState<boolean>(hasSaveData);

  const handleAutoSaveChange = () => {
    const next = !isAutoSaved;
    setLocalIsAutoSaved(next);
    setIsAutoSaveEnabled(next);
  };

  const handleClickClearLocalStorage = () => {
    clearAllRuntimeDataFromLocalStorage();
    setSaveExists(false);
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
      {!isAutoSaved && saveExists && (
        <button onClick={handleClickClearLocalStorage}>Clear Save</button>
      )}
    </div>
  );
}

export default AutoSaveTrigger;

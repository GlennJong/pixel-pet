import React from "react";
import "./JsonEditor.css";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

interface Props {
  value: JSONValue;
  onChange: (value: JSONValue) => void;
  keyName?: string;
  prefixName?: string;
  wording?: Record<string, string>;
  template?: Record<string, any>;
  hide?: string[];
  lock?: string[];
  title?: string;
  hintPic?: Record<string, string>;
}

const JsonEditor: React.FC<Props> = ({
  value,
  onChange,
  prefixName,
  keyName,
  template = {},
  wording = {},
  hide = [],
  lock = [],
  title,
  hintPic = {},
}) => {
  const [collapsed, setCollapsed] = React.useState(true);
  const [localCollapsed, setLocalCollapsed] = React.useState(false);
  const [showHint, setShowHint] = React.useState<string | null>(null);
  const hintUrl = keyName && hintPic[keyName] ? hintPic[keyName] : null;

  // 只在最外層渲染 title
  if (title) {
    return (
      <div className="json-editor" style={{ position: "relative" }}>
        <div
          style={{
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: 14,
            position: "sticky",
            top: "0",
            background: "rgba(30,30,30,0.5)",
            zIndex: 10,
            padding: "6px 4px",
            borderBottom: "1px solid #444",
          }}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? "▶ " : "▼ "}
          {title}
        </div>
        {!collapsed && (
          <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 100px)" }}>
            <JsonEditor
              value={value}
              template={template}
              onChange={onChange}
              wording={wording}
              hide={hide}
              lock={lock}
              hintPic={hintPic}
            />
          </div>
        )}
      </div>
    );
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    // 隱藏欄位
    if (keyName && hide.includes(keyName)) return null;

    const labelText = keyName ? (wording[keyName] ?? keyName) : undefined;
    const isLocked = keyName ? lock.includes(keyName) : false;
    return (
      <div style={{ marginBottom: 4 }}>
        <label style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
          {isNaN(Number(labelText)) ? (
            <span>{labelText}: </span>
          ) : (
            <span>
              {prefixName}
              {Number(labelText) + 1}{" "}
            </span>
          )}
          <input
            type={typeof value === "number" ? "number" : "text"}
            value={
              value === null
                ? ""
                : typeof value === "boolean"
                  ? String(value)
                  : value
            }
            onChange={(e) => {
              if (typeof value === "number") {
                let v = e.target.value;
                // 僅允許合法數字
                if (v === "" || v === null) {
                  onChange(0);
                } else {
                  // 若目前值為 0 且輸入新數字，去除前導 0
                  if (String(value) === "0" && /^0\d+$/.test(v)) {
                    v = v.replace(/^0+/, "");
                  }
                  if (!isNaN(Number(v))) {
                    onChange(Number(v));
                  }
                }
                // 非合法數字則不更新
              } else {
                onChange(e.target.value);
              }
            }}
            style={{ fontSize: "12px" }}
            disabled={isLocked}
          />
        </label>
        {hintUrl && (
          <span
            className="hint-icon"
            style={{ marginLeft: 8, cursor: "pointer", position: "relative" }}
            onMouseEnter={() => setShowHint(hintUrl)}
            onMouseLeave={() => setShowHint(null)}
          >
            <span className="hint-trigger">?</span>
            {showHint && (
              <div
                style={{
                  position: "absolute",
                  left: "110%",
                  top: 0,
                  zIndex: 100,
                  background: "#222",
                  border: "1px solid #444",
                  padding: 2,
                }}
              >
                <img
                  src={showHint}
                  alt="hint"
                  style={{ maxWidth: 200, maxHeight: 200 }}
                />
              </div>
            )}
          </span>
        )}
      </div>
    );
  }
  if (Array.isArray(value)) {
    if (keyName && hide.includes(keyName)) return null;
    const labelText = keyName ? (wording[keyName] ?? keyName) : undefined;
    const isLocked = keyName ? lock.includes(keyName) : false;
    // 依照 template[keyName][0] 產生預設物件
    const getDefaultItem = () => {
      if (keyName && template && template[keyName]) {
        // 深拷貝，避免 reference 問題
        return JSON.parse(JSON.stringify(template[keyName]));
      }
      return "";
    };
    const handleAdd = () => {
      onChange([...value, getDefaultItem()]);
    };
    const handleRemove = (idx: number) => {
      const newArr = value.slice();
      newArr.splice(idx, 1);
      onChange(newArr);
    };
    return (
      <fieldset
        style={{
          border: "1px solid hsla(0, 0%, 100%, 0.2)",
          marginBottom: 8,
          width: "100%",
        }}
      >
        {labelText && (
          <legend style={{ fontSize: "12px" }}>
            {labelText}
            {hintUrl && (
              <span
                className="hint-icon"
                style={{
                  marginLeft: 8,
                  cursor: "pointer",
                  position: "relative",
                }}
                onMouseEnter={() => setShowHint(hintUrl)}
                onMouseLeave={() => setShowHint(null)}
              >
                <span className="hint-trigger">?</span>
                {showHint && (
                  <div
                    style={{
                      position: "absolute",
                      left: "110%",
                      top: 0,
                      zIndex: 100,
                      background: "#222",
                      border: "1px solid #444",
                      padding: 2,
                    }}
                  >
                    <img
                      src={showHint}
                      alt="hint"
                      style={{ maxWidth: 200, maxHeight: 200 }}
                    />
                  </div>
                )}
              </span>
            )}
          </legend>
        )}
        {value.map((v, i) => (
          <div
            className="field-container"
            key={i}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <JsonEditor
              value={v}
              onChange={(nv) => {
                const newArr = [...value];
                newArr[i] = nv;
                onChange(newArr);
              }}
              keyName={String(i)}
              prefixName={labelText}
              template={template}
              wording={wording}
              hide={hide}
              lock={lock}
              hintPic={hintPic}
            />
            <button
              className="remove-btn"
              type="button"
              onClick={() => handleRemove(i)}
              disabled={isLocked}
            >
              x
            </button>
          </div>
        ))}
        <button
          className="add-btn"
          style={{ marginTop: "4px", width: "100%" }}
          type="button"
          onClick={handleAdd}
          disabled={isLocked}
        >
          +新增{labelText}
        </button>
      </fieldset>
    );
  }
  if (typeof value === "object" && value !== null) {
    if (keyName && hide.includes(keyName)) return null;
    const labelText = keyName ? (wording[keyName] ?? keyName) : undefined;
    // 判斷是否有可遞迴的子層
    const hasRecursiveChild = Object.values(value).some(
      (v) => typeof v === "object" && v !== null,
    );

    return (
      <fieldset
        style={{
          border: "1px solid hsla(0, 0%, 100%, 0.2)",
          marginBottom: 4,
          width: "100%",
          position: "relative",
        }}
      >
        {labelText && (
          <legend
            style={{
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              position: "relative",
            }}
          >
            {isNaN(Number(labelText)) ? (
              <span>{labelText}: </span>
            ) : (
              <span>
                {prefixName}
                {Number(labelText) + 1}{" "}
              </span>
            )}
            {hasRecursiveChild && (
              <button
                className="collapse-btn"
                type="button"
                style={{ transform: `rotate(${localCollapsed ? 0 : 90}deg)` }}
                onClick={() => setLocalCollapsed((c) => !c)}
              >
                {">"}
              </button>
            )}
          </legend>
        )}
        {!localCollapsed &&
          Object.entries(value).map(([k, v]) => (
            <JsonEditor
              key={k}
              value={v}
              onChange={(nv) => {
                onChange({ ...value, [k]: nv });
              }}
              keyName={k}
              wording={wording}
              template={template}
              hide={hide}
              lock={lock}
              hintPic={hintPic}
            />
          ))}
        {/* 可加上新增/刪除 key 的功能 */}
      </fieldset>
    );
  }
  return null;
};

export default JsonEditor;

import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

type QuotationLineItemOption = {
  id: string;
  name: string;
  code?: string | null;
};

type QuotationLineItemComboboxProps = {
  ariaLabel: string;
  value: string;
  items: QuotationLineItemOption[];
  disabled?: boolean;
  placeholder?: string;
  createLabel: (value: string) => string;
  createAndEditLabel: (value: string) => string;
  onValueChange: (value: string) => void;
  onSelectItem: (id: string) => void;
  onCreateCustom: (value: string) => void;
  onCreateAndEdit: (value: string) => void;
};

export const QuotationLineItemCombobox = forwardRef<
  HTMLInputElement,
  QuotationLineItemComboboxProps
>(function QuotationLineItemCombobox(
  {
    ariaLabel,
    value,
    items,
    disabled = false,
    placeholder,
    createLabel,
    createAndEditLabel,
    onValueChange,
    onSelectItem,
    onCreateCustom,
    onCreateAndEdit,
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const query = value.trim().toLocaleLowerCase();

  const filteredItems = useMemo(() => {
    if (!query) return items.slice(0, 8);

    return items
      .filter((item) => {
        const haystack = `${item.name} ${item.code ?? ""}`.toLocaleLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [items, query]);

  const exactMatch = filteredItems.some(
    (item) => item.name.trim().toLocaleLowerCase() === query,
  );

  const canCreate = value.trim().length > 0 && !exactMatch;
  const optionCount = filteredItems.length + (canCreate ? 2 : 0);

  function commitActiveOption() {
    if (optionCount === 0) return false;

    if (activeIndex < filteredItems.length) {
      const item = filteredItems[activeIndex];
      onSelectItem(item.id);
      setOpen(false);
      return true;
    }

    if (
      canCreate &&
      activeIndex === filteredItems.length
    ) {
      onCreateCustom(value.trim());
      setOpen(false);
      return true;
    }

    if (
      canCreate &&
      activeIndex === filteredItems.length + 1
    ) {
      onCreateAndEdit(value.trim());
      setOpen(false);
      return true;
    }

    return false;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        optionCount > 0
          ? Math.min(current + 1, optionCount - 1)
          : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && open) {
      if (commitActiveOption()) {
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!open) {
      setDropdownStyle(null);
      return;
    }

    const input = inputRef.current;
    if (!input) return;

    const updatePosition = () => {
      const rect = input.getBoundingClientRect();

      setDropdownStyle({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <input
        ref={(element) => {
          inputRef.current = element;

          if (typeof ref === "function") {
            ref(element);
          } else if (ref) {
            ref.current = element;
          }
        }}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        autoComplete="off"
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(0);
        }}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 100);
        }}
        className="min-h-9 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/10"
      />

      {open &&
        optionCount > 0 &&
        dropdownStyle &&
        createPortal(
          <div
            className="fixed z-[100] max-h-64 overflow-auto rounded-lg border border-white/10 bg-slate-950 p-1 shadow-2xl"
            style={{
              top: dropdownStyle.top,
              left: dropdownStyle.left,
              width: dropdownStyle.width,
            }}
          >
          {filteredItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelectItem(item.id);
                setOpen(false);
              }}
              className={[
                "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm",
                index === activeIndex
                  ? "bg-sky-400/10 text-sky-200"
                  : "text-slate-200 hover:bg-white/5",
              ].join(" ")}
            >
              <span className="truncate">{item.name}</span>
              {item.code && (
                <span className="shrink-0 text-xs text-slate-500">
                  {item.code}
                </span>
              )}
            </button>
          ))}

          {canCreate && (
        <>
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCreateCustom(value.trim());
                setOpen(false);
              }}
              className={[
                "w-full rounded-md px-2 py-2 text-left text-sm",
                activeIndex === filteredItems.length
                  ? "bg-emerald-400/10 text-emerald-200"
                  : "text-emerald-300 hover:bg-white/5",
              ].join(" ")}
            >
              {createLabel(value.trim())}
            </button>

          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onCreateAndEdit(value.trim());
              setOpen(false);
            }}
            className={[
              "w-full rounded-md px-2 py-2 text-left text-sm",
              activeIndex === filteredItems.length + 1
                ? "bg-sky-400/10 text-sky-200"
                : "text-sky-300 hover:bg-white/5",
            ].join(" ")}
          >
            {createAndEditLabel(value.trim())}
          </button>
        </>
          )}
          </div>,
          document.body,
        )}
    </div>
  );
});

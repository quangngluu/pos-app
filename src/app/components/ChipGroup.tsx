/** ChipGroup - radio group styled as chips/pills */

export type ChipGroupOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

export type ChipGroupProps = {
    value: string;
    options: ChipGroupOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    onInteract?: () => void;
    compact?: boolean;
};

export function ChipGroup({ value, options, onChange, disabled, onInteract, compact }: ChipGroupProps) {
    return (
        <div
            role="radiogroup"
            onMouseEnter={onInteract}
            onFocus={onInteract}
            style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                width: "100%",
            }}
        >
            {options.map((opt) => {
                const isSelected = opt.value === value;
                const isDisabled = disabled || opt.disabled;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        disabled={isDisabled}
                        onClick={() => !isDisabled && onChange(opt.value)}
                        style={{
                            padding: "6px 12px",
                            border: isSelected ? "2px solid var(--color-interactive-primary)" : "1px solid var(--color-border-light)",
                            borderRadius: 16,
                            background: isSelected ? "var(--color-interactive-primary)" : isDisabled ? "var(--color-bg-tertiary)" : "var(--color-bg-secondary)",
                            color: isDisabled ? "var(--color-text-tertiary)" : isSelected ? "var(--color-text-inverse)" : "var(--color-text-primary)",
                            cursor: isDisabled ? "not-allowed" : "pointer",
                            fontSize: 13,
                            fontWeight: isSelected ? 600 : 400,
                            transition: "all 0.15s ease",
                            opacity: isDisabled ? 0.4 : 1,
                            whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => {
                            if (!isDisabled && !isSelected) {
                                e.currentTarget.style.background = "var(--color-bg-tertiary)";
                                e.currentTarget.style.borderColor = "var(--color-border-default)";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isDisabled && !isSelected) {
                                e.currentTarget.style.background = "var(--color-bg-secondary)";
                                e.currentTarget.style.borderColor = "var(--color-border-light)";
                            }
                        }}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

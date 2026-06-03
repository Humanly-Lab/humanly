import React, { useState, useRef, useEffect } from 'react';

interface ColorPickerProps {
  currentColor: string;
  colors: ReadonlyArray<{ value: string; label: string }>;
  onColorChange: (color: string) => void;
  buttonLabel?: React.ReactNode;
  buttonTitle?: string;
  colorIndicator?: 'icon' | 'swatch';
}

/**
 * ColorPicker component with preset colors and custom color input
 */
export function ColorPicker({
  currentColor,
  colors,
  onColorChange,
  buttonLabel = '●',
  buttonTitle = 'Color',
  colorIndicator = 'icon',
}: ColorPickerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(currentColor);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleColorSelect = (color: string) => {
    onColorChange(color);
    setCustomColor(color);
    setIsOpen(false);
  };

  const handleCustomColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const color = event.target.value;
    setCustomColor(color);
    onColorChange(color);
  };

  return (
    <div style={styles.container} ref={pickerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          ...styles.button,
          ...(colorIndicator === 'icon'
            ? { color: currentColor !== 'transparent' ? currentColor : '#000000' }
            : {}),
        }}
        aria-label={buttonTitle}
        title={buttonTitle}
      >
        {colorIndicator === 'swatch' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            {buttonLabel}
            <div style={{
              width: '16px',
              height: '3px',
              borderRadius: '1px',
              backgroundColor: currentColor !== 'transparent' ? currentColor : 'transparent',
              border: currentColor === 'transparent' ? '1px solid #d1d5db' : 'none',
            }} />
          </div>
        ) : buttonLabel}
      </button>

      {isOpen && (
        <div style={styles.dropdown}>
          <div style={styles.colorGrid}>
            {colors.map((color) => (
              <button
                key={color.value}
                onClick={() => handleColorSelect(color.value)}
                style={{
                  ...styles.colorButton,
                  backgroundColor: color.value,
                  border:
                    currentColor === color.value
                      ? '2px solid #1a1c20'
                      : '1px solid #d8d9cf',
                }}
                aria-label={color.label}
                title={color.label}
              />
            ))}
          </div>

          <div style={styles.customColorSection}>
            <label style={styles.customColorLabel}>
              Custom:
              <input
                type="color"
                value={customColor}
                onChange={handleCustomColorChange}
                style={styles.customColorInput}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative' as const,
  },
  button: {
    padding: '6px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: '4px',
    padding: '8px',
    backgroundColor: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    zIndex: 1000,
    minWidth: '200px',
  },
  colorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '4px',
    marginBottom: '8px',
  },
  colorButton: {
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: 0,
  },
  customColorSection: {
    borderTop: '1px solid #e5e7eb',
    paddingTop: '8px',
  },
  customColorLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  },
  customColorInput: {
    width: '40px',
    height: '32px',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};

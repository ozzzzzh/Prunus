import { useState, useEffect, useRef } from 'react';
import { Type, Palette, Bold, Italic, Underline, Strikethrough, X, PenTool } from 'lucide-react';
import {
  toggleBold, toggleItalic, toggleUnderline, toggleStrikethrough,
  HIGHLIGHT_COLORS, TEXT_COLORS,
  isBold, isItalic, isUnderline, isStrikethrough,
  saveSelection, restoreSelection
} from '../../utils/richtext';

interface FormatToolbarProps {
  isExpanded: boolean;
  onMenuToggle: (menuType: 'text' | 'color' | 'highlight' | null) => void;
  autoOpenMenu?: 'text' | 'color' | 'highlight' | null;
}

export default function FormatToolbar({ isExpanded, onMenuToggle, autoOpenMenu }: FormatToolbarProps) {
  const [activeMenu, setActiveMenu] = useState<'text' | 'color' | 'highlight' | null>(null);
  // 标记是否是用户手动打开的菜单
  const isManuallyOpenedRef = useRef(false);

  // 当 autoOpenMenu 变化时，只有非手动打开时才自动打开菜单
  useEffect(() => {
    if (autoOpenMenu && !isManuallyOpenedRef.current) {
      if (autoOpenMenu !== activeMenu) {
        setActiveMenu(autoOpenMenu);
        onMenuToggle(autoOpenMenu);
      }
    } else if (!autoOpenMenu && !isManuallyOpenedRef.current && activeMenu) {
      // 只有非手动打开时，才根据 autoOpenMenu 关闭
      setActiveMenu(null);
      onMenuToggle(null);
    }
  }, [autoOpenMenu, activeMenu, onMenuToggle]);

  const handleMenuClick = (menuType: 'text' | 'color' | 'highlight') => {
    // 用户手动点击，标记为手动打开
    isManuallyOpenedRef.current = activeMenu !== menuType;
    const newMenu = activeMenu === menuType ? null : menuType;
    setActiveMenu(newMenu);
    onMenuToggle(newMenu);
  };

  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const toolButtonClass = "p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0";
  const activeButtonClass = " bg-leaf-100 text-leaf-700";

  return (
    <div
      className={`flex items-center gap-1 overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'w-[120px] opacity-100' : 'w-0 opacity-0'}`}
      onMouseDown={preventBlur}
    >
      <div className="flex items-center gap-1 px-1">
        <button
          onMouseDown={preventBlur}
          onClick={() => handleMenuClick('text')}
          className={toolButtonClass + (activeMenu === 'text' ? activeButtonClass : '')}
          title="Text Format"
        >
          <Type size={16} />
        </button>

        <button
          onMouseDown={preventBlur}
          onClick={() => handleMenuClick('color')}
          className={toolButtonClass + (activeMenu === 'color' ? activeButtonClass : '')}
          title="Text Color"
        >
          <Palette size={16} />
        </button>

        <button
          onMouseDown={preventBlur}
          onClick={() => handleMenuClick('highlight')}
          className={toolButtonClass + (activeMenu === 'highlight' ? activeButtonClass : '')}
          title="Highlight Background"
        >
          <PenTool size={16} />
        </button>
      </div>
    </div>
  );
}

interface SubMenuProps {
  menuType: 'text' | 'color' | 'highlight' | null;
  onClose: () => void;
}

export function FormatSubMenu({ menuType, onClose }: SubMenuProps) {
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  });

  // 跟踪当前选中的颜色（用于实现点击同一颜色取消的逻辑）
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedHighlight, setSelectedHighlight] = useState<string | null>(null);

  // 保存选区的 ref
  const savedRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    const updateFormats = () => {
      setActiveFormats({
        bold: isBold(),
        italic: isItalic(),
        underline: isUnderline(),
        strikethrough: isStrikethrough(),
      });
    };

    updateFormats();
    document.addEventListener('selectionchange', updateFormats);
    return () => document.removeEventListener('selectionchange', updateFormats);
  }, [menuType]);

  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
    // 在 mouseDown 时保存选区
    savedRangeRef.current = saveSelection();
  };

  const executeFormat = (formatFn: () => void) => {
    // 恢复选区
    if (savedRangeRef.current) {
      restoreSelection(savedRangeRef.current);
    }
    formatFn();
  };

  // 处理文字颜色点击
  const handleTextColorClick = (color: string) => {
    // 恢复选区
    if (savedRangeRef.current) {
      restoreSelection(savedRangeRef.current);
    }

    // 如果点击的是当前选中的颜色，则取消颜色
    if (selectedColor === color) {
      document.execCommand('foreColor', false, '#000000');
      setSelectedColor(null);
    } else {
      // 否则应用颜色并选中
      document.execCommand('foreColor', false, color);
      setSelectedColor(color);
    }
    // 保持菜单打开，不调用 onClose()
  };

  // 处理背景颜色点击
  const handleHighlightClick = (color: string) => {
    // 恢复选区
    if (savedRangeRef.current) {
      restoreSelection(savedRangeRef.current);
    }

    // 如果点击的是当前选中的颜色，则取消颜色
    if (selectedHighlight === color) {
      document.execCommand('hiliteColor', false, 'transparent');
      setSelectedHighlight(null);
    } else {
      // 否则应用颜色并选中
      document.execCommand('hiliteColor', false, color);
      setSelectedHighlight(color);
    }
    // 保持菜单打开，不调用 onClose()
  };

  if (!menuType) return null;

  const colorButtonClass = (isSelected: boolean) =>
    `w-6 h-6 rounded border-2 transition-all ${isSelected ? 'border-leaf-500 scale-110 shadow-md' : 'border-gray-200 hover:scale-110'}`;
  const formatButtonClass = (isActive: boolean) =>
    `p-1.5 rounded hover:bg-leaf-100 transition-colors ${isActive ? 'bg-leaf-200 text-leaf-800' : 'text-gray-600'}`;

  return (
    <div
      className="bg-leaf-50 px-4 py-2 border-b border-leaf-100 flex items-center gap-2"
      onMouseDown={preventBlur}
    >
      <span className="text-xs text-leaf-600 font-medium">
        {menuType === 'text' ? 'Text Format:' : menuType === 'color' ? 'Text Color:' : 'Highlight:'}
      </span>

      {menuType === 'text' && (
        <div className="flex items-center gap-1">
          <button
            onMouseDown={preventBlur}
            onClick={() => executeFormat(toggleBold)}
            className={formatButtonClass(activeFormats.bold)}
            title="Bold"
          >
            <Bold size={14} />
          </button>
          <button
            onMouseDown={preventBlur}
            onClick={() => executeFormat(toggleItalic)}
            className={formatButtonClass(activeFormats.italic)}
            title="Italic"
          >
            <Italic size={14} />
          </button>
          <button
            onMouseDown={preventBlur}
            onClick={() => executeFormat(toggleUnderline)}
            className={formatButtonClass(activeFormats.underline)}
            title="Underline"
          >
            <Underline size={14} />
          </button>
          <button
            onMouseDown={preventBlur}
            onClick={() => executeFormat(toggleStrikethrough)}
            className={formatButtonClass(activeFormats.strikethrough)}
            title="Strikethrough"
          >
            <Strikethrough size={14} />
          </button>
          <button onMouseDown={preventBlur} onClick={onClose} className="p-1.5 rounded hover:bg-red-100 text-gray-400 ml-2" title="Close">
            <X size={14} />
          </button>
        </div>
      )}

      {menuType === 'color' && (
        <div className="flex items-center gap-1">
          {TEXT_COLORS.map(color => (
            <button
              key={color.value}
              onMouseDown={preventBlur}
              onClick={() => handleTextColorClick(color.value)}
              className={colorButtonClass(selectedColor === color.value)}
              style={{ backgroundColor: color.value }}
              title={color.label}
            />
          ))}
          <button onMouseDown={preventBlur} onClick={onClose} className="p-1.5 rounded hover:bg-red-100 text-gray-400 ml-2" title="Close">
            <X size={14} />
          </button>
        </div>
      )}

      {menuType === 'highlight' && (
        <div className="flex items-center gap-1">
          {HIGHLIGHT_COLORS.map(color => (
            <button
              key={color.value}
              onMouseDown={preventBlur}
              onClick={() => handleHighlightClick(color.value)}
              className={colorButtonClass(selectedHighlight === color.value)}
              style={{ backgroundColor: color.value }}
              title={color.label}
            />
          ))}
          <button onMouseDown={preventBlur} onClick={onClose} className="p-1.5 rounded hover:bg-red-100 text-gray-400 ml-2" title="Close">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
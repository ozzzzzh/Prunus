/**
 * 微应用清单
 *
 * 这里只有一个长度为 1 的表，**不是插件系统**。存在的意义是：加第二个微应用时
 * 是「加一行」，而不是回头重构宿主与入口。
 *
 * 刻意不做的：沙箱、第三方加载、权限模型、版本协商。
 * 那些等真的出现第二个、第三个微应用、并且证明这个窄接口不够用时再说 ——
 * 只用一个例子设计出来的扩展接口，几乎一定是错的。
 */

import type { ComponentType, ReactNode } from 'react';
import { FileText } from 'lucide-react';
import type { MicroAppId } from '../../types/microApp';

/** 面板组件收到的唯一参数。微应用拿不到 store，只能通过主应用给的动作改动画布 */
export interface MicroAppPanelProps {
  sessionId: string;
}

export interface MicroAppDescriptor {
  id: MicroAppId;
  /** 胶囊按钮上的文字 */
  label: string;
  /** 面板标题栏文案 */
  title: string;
  icon: ReactNode;
  /** 动态 import：微应用不进首屏包，只有真的打开时才下载 */
  load: () => Promise<{ default: ComponentType<MicroAppPanelProps> }>;
}

export const MICRO_APPS: Record<MicroAppId, MicroAppDescriptor> = {
  pdf: {
    id: 'pdf',
    label: 'PDF',
    title: '论文阅读',
    icon: <FileText size={14} />,
    load: () => import('./pdf/PdfPanel'),
  },
};

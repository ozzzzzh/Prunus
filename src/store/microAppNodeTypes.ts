/**
 * 微应用贡献给画布的节点类型
 *
 * 为什么要有这一层：主应用的画布只认识 `message` 这一种节点。Prompt 工作台
 * 需要自己的节点外观（勾选框、细分按钮、未选虚线），但**不能**把那些逻辑塞进
 * MessageNode —— 那会让每个聊天节点都背上 Prompt 的代码。
 *
 * 所以由微应用在打开时把自己的节点类型"挂"上来，用完即留在内存里（不注销）：
 * 注销之后已经渲染的 Prompt 树会找不到组件。隔离的实质是"不进首屏包、不被聊天会话用到"，
 * 而不是"关掉面板就把已渲染的组件拆掉"。
 */

import { create } from 'zustand';
import type { NodeTypes } from '@xyflow/react';

interface MicroAppNodeTypesState {
  nodeTypes: NodeTypes;
  register: (types: NodeTypes) => void;
}

export const useMicroAppNodeTypesStore = create<MicroAppNodeTypesState>()((set) => ({
  nodeTypes: {},

  register: (types) =>
    set((state) => {
      let changed = false;
      const next = { ...state.nodeTypes };

      for (const [name, component] of Object.entries(types)) {
        if (next[name] !== component) {
          next[name] = component;
          changed = true;
        }
      }

      // 返回原对象 = zustand 不通知订阅者；画布的布局 memo 因此不会被白刷新一次
      return changed ? { nodeTypes: next } : state;
    }),
}));

import fs from "fs";
import path from "path";

const ensureDir = (dir: string) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
};

const cjsSource = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class ComponentEmitter {
  constructor() {
    this._callbacks = {};
  }
  on(event, fn) {
    if (!fn) {
      return this;
    }
    (this._callbacks[event] || (this._callbacks[event] = [])).push(fn);
    return this;
  }
  once(event, fn) {
    if (!fn) {
      return this;
    }
    const listener = (...args) => {
      this.off(event, listener);
      listener.fn.apply(this, args);
    };
    listener.fn = fn;
    return this.on(event, listener);
  }
  off(event, fn) {
    if (!event) {
      this._callbacks = {};
      return this;
    }
    const listeners = this._callbacks[event];
    if (!listeners) {
      return this;
    }
    if (!fn) {
      delete this._callbacks[event];
      return this;
    }
    for (let i = listeners.length - 1; i >= 0; i--) {
      const listener = listeners[i];
      if (listener === fn || listener.fn === fn) {
        listeners.splice(i, 1);
      }
    }
    if (listeners.length === 0) {
      delete this._callbacks[event];
    }
    return this;
  }
  emitReserved(event, ...args) {
    return this.emit(event, ...args);
  }
  emit(event, ...args) {
    const listeners = this._callbacks[event];
    if (!listeners) {
      return this;
    }
    listeners.slice().forEach((listener) => {
      listener.apply(this, args);
    });
    return this;
  }
  listeners(event) {
    return this._callbacks[event] ? [...this._callbacks[event]] : [];
  }
  hasListeners(event) {
    return this.listeners(event).length > 0;
  }
}
exports.Emitter = ComponentEmitter;
exports.default = ComponentEmitter;
`;

const esmSource = `class ComponentEmitter {
  constructor() {
    this._callbacks = {};
  }
  on(event, fn) {
    if (!fn) {
      return this;
    }
    (this._callbacks[event] || (this._callbacks[event] = [])).push(fn);
    return this;
  }
  once(event, fn) {
    if (!fn) {
      return this;
    }
    const listener = (...args) => {
      this.off(event, listener);
      listener.fn.apply(this, args);
    };
    listener.fn = fn;
    return this.on(event, listener);
  }
  off(event, fn) {
    if (!event) {
      this._callbacks = {};
      return this;
    }
    const listeners = this._callbacks[event];
    if (!listeners) {
      return this;
    }
    if (!fn) {
      delete this._callbacks[event];
      return this;
    }
    for (let i = listeners.length - 1; i >= 0; i--) {
      const listener = listeners[i];
      if (listener === fn || listener.fn === fn) {
        listeners.splice(i, 1);
      }
    }
    if (listeners.length === 0) {
      delete this._callbacks[event];
    }
    return this;
  }
  emitReserved(event, ...args) {
    return this.emit(event, ...args);
  }
  emit(event, ...args) {
    const listeners = this._callbacks[event];
    if (!listeners) {
      return this;
    }
    listeners.slice().forEach((listener) => {
      listener.apply(this, args);
    });
    return this;
  }
  listeners(event) {
    return this._callbacks[event] ? [...this._callbacks[event]] : [];
  }
  hasListeners(event) {
    return this.listeners(event).length > 0;
  }
}
export { ComponentEmitter as Emitter };
export default ComponentEmitter;
`;

const getTargets = (): string[] => {
  const targets = new Set<string>();
  const baseTarget = path.join(
    process.cwd(),
    "node_modules",
    "@socket.io",
    "component-emitter"
  );
  targets.add(baseTarget);

  const pnpmRoot = path.join(process.cwd(), "node_modules", ".pnpm");
  if (fs.existsSync(pnpmRoot) && fs.statSync(pnpmRoot).isDirectory()) {
    for (const entry of fs.readdirSync(pnpmRoot)) {
      const entryPath = path.join(pnpmRoot, entry);
      if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isDirectory()) {
        continue;
      }

      const nested = path.join(
        entryPath,
        "node_modules",
        "@socket.io",
        "component-emitter"
      );
      targets.add(nested);
    }
  }

  targets.delete("");
  return Array.from(targets);
};

const writeSources = (target: string) => {
  const cjsDir = path.join(target, "lib", "cjs");
  const esmDir = path.join(target, "lib", "esm");
  const cjsIndex = path.join(cjsDir, "index.js");
  const esmIndex = path.join(esmDir, "index.js");

  if (!fs.existsSync(cjsIndex)) {
    ensureDir(cjsDir);
    fs.writeFileSync(cjsIndex, cjsSource, "utf8");
  }

  if (!fs.existsSync(esmIndex)) {
    ensureDir(esmDir);
    fs.writeFileSync(esmIndex, esmSource, "utf8");
  }
};

export const ensureComponentEmitter = () => {
  const targets = getTargets();
  for (const target of targets) {
    writeSources(target);
  }
};

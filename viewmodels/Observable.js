/**
 * Observable.js
 * Proxy-based reactive state management with deep subscription and batching support.
 */
export class Observable {
  constructor(initialState = {}) {
    this._listeners = new Map();
    this._anyListeners = new Set();
    this._batching = false;
    this._pendingNotifications = new Map();
    
    this.state = this._createProxy(initialState);
  }

  _createProxy(obj, pathPrefix = '') {
    const handler = {
      get: (target, key) => {
        const val = target[key];
        if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
          return this._createProxy(val, `${pathPrefix}${key}.`);
        }
        return val;
      },
      set: (target, key, value) => {
        const oldValue = target[key];
        if (oldValue === value) return true;
        
        target[key] = value;
        const fullPath = `${pathPrefix}${key}`;
        
        if (this._batching) {
          if (!this._pendingNotifications.has(fullPath)) {
            this._pendingNotifications.set(fullPath, { value, oldValue });
          } else {
            this._pendingNotifications.get(fullPath).value = value;
          }
        } else {
          this._notify(fullPath, value, oldValue);
        }
        return true;
      }
    };
    return new Proxy(obj, handler);
  }

  subscribe(property, callback) {
    if (!this._listeners.has(property)) {
      this._listeners.set(property, new Set());
    }
    this._listeners.get(property).add(callback);
    return () => this.unsubscribe(property, callback);
  }

  subscribeAny(callback) {
    this._anyListeners.add(callback);
    return () => this._anyListeners.delete(callback);
  }

  unsubscribe(property, callback) {
    if (this._listeners.has(property)) {
      this._listeners.get(property).delete(callback);
    }
  }

  batch(fn) {
    this._batching = true;
    try {
      fn();
    } finally {
      this._batching = false;
      const notifications = new Map(this._pendingNotifications);
      this._pendingNotifications.clear();
      
      for (const [property, { value, oldValue }] of notifications) {
        this._notify(property, value, oldValue);
      }
    }
  }

  _notify(property, value, oldValue) {
    if (this._listeners.has(property)) {
      for (const callback of this._listeners.get(property)) {
        try {
          callback(value, oldValue, property);
        } catch (e) {
          console.error(`Error in observer callback for "${property}":`, e);
        }
      }
    }

    const segments = property.split('.');
    for (let i = 1; i < segments.length; i++) {
      const parentPath = segments.slice(0, i).join('.');
      if (this._listeners.has(parentPath)) {
        const parentVal = segments.slice(0, i).reduce((o, k) => o && o[k], this.state);
        for (const callback of this._listeners.get(parentPath)) {
          try {
            callback(parentVal, undefined, parentPath);
          } catch (e) {
            console.error(`Error in parent observer for "${parentPath}":`, e);
          }
        }
      }
    }

    for (const callback of this._anyListeners) {
      try {
        callback(property, value, oldValue);
      } catch (e) {
        console.error('Error in general observer callback:', e);
      }
    }
  }
}

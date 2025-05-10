// frag.js

export const frag = (function () {
  // === Armazena templates compilados ===
  const templateCache = {};

  // === Sistema Reativo Básico ===
  let store = {};
  function createStore(initialState) {
    store = JSON.parse(JSON.stringify(initialState));
    return new Proxy(store, {
      set(target, prop, value) {
        target[prop] = value;
        triggerWatchers(prop);
        return true;
      }
    });
  }

  const watchers = [];

  function watch(callback) {
    watchers.push(callback);
  }

  function triggerWatchers(changedKey) {
    watchers.forEach(cb => cb(changedKey));
  }

  // === Renderização de Templates ===
  function compileTemplate(str, data) {
    return str.replace(/{{\s*(.*?)\s*}}/g, (_, key) => {
      if (key.startsWith('each ')) {
        const match = key.match(/each (\w+)(?: as (\w+))?/);
        if (!match) return '';
        const listKey = match[1];
        const itemName = match[2] || 'item';
        const list = getNestedValue(data, listKey);
        if (!Array.isArray(list)) return '';
        return list.map(item => {
          return str.split(`{{ each ${listKey} as ${itemName} }}`)[1]
                   .split(`{{ end }}`)[0]
                   .replace(new RegExp(`{{\\s*${itemName}\\.`), (_, name) => `{{ ${name}`)
                   .replace(new RegExp(`{{\\s*${itemName}\\b`, 'g'), (_, name) => `{{ `)
                   .replace(/\.\b/g, '')
                   .replace(/(\w+)\./g, '$1_')
                   .replace(/_/g, '.');
        }).join('');
      } else if (key.startsWith('this.')) {
        return data[key.replace('this.', '')];
      } else {
        return getNestedValue(data, key);
      }
    });
  }

  function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }

  // === Criação de Elementos ===
  function frag(strings, ...values) {
    let el;

    // === MODO 1: Template String HTML ===
    if (typeof strings === "string" || Array.isArray(strings)) {
      const html = strings.map((s, i) => s + (values[i] ?? '')).join('');
      const template = document.createElement('template');
      template.innerHTML = html.trim();
      el = template.content.cloneNode(true);
    }

    // === MODO 2: Criação Direta com Tag e Props ===
    else {
      const tag = strings;
      const props = values[0] || {};
      const children = values.slice(1);

      el = document.createElement(tag);

      for (const [key, value] of Object.entries(props)) {
        if (key.startsWith('on') && typeof value === 'function') {
          el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'style' && typeof value === 'object') {
          Object.assign(el.style, value);
        } else {
          el[key] = value;
        }
      }

      children.flat().forEach(child => {
        if (child instanceof Node) {
          el.appendChild(child);
        } else {
          el.appendChild(document.createTextNode(child));
        }
      });
    }

    // === Método placeOn(selector, index) ===
    el.placeOn = function (selector, index = -1) {
      const elements = document.querySelectorAll(selector);

      if (!elements.length) {
        console.warn(`Nenhum elemento encontrado com o seletor "${selector}".`);
        return this;
      }

      elements.forEach(parent => {
        const children = Array.from(parent.children);
        const count = children.length;
        let position;

        if (index < 0) {
          position = Math.max(count + index, 0);
        } else {
          position = Math.min(index, count);
        }

        if (children[position]) {
          parent.insertBefore(this.cloneNode(true), children[position]);
        } else {
          parent.appendChild(this.cloneNode(true));
        }
      });

      return this;
    };

    return el;
  }

  // === Extensibilidade com Plugins ===
  frag.extend = function(name, methods) {
    Object.assign(frag.prototype, methods);
    return this;
  };

  // === Seleção e Manipulação de Elementos ===
  frag.get = function(selector) {
    const elements = document.querySelectorAll(selector);

    if (!elements.length) {
      console.warn(`Nenhum elemento encontrado com o seletor "${selector}".`);
      return {
        then: () => this,
        catch: () => this
      };
    }

    return {
      elements,

      add(key, value) {
        this.elements.forEach(el => {
          if (key === 'class' || key === 'className') {
            el.classList.add(value);
          } else if (el[key] instanceof DOMTokenList) {
            el[key].add(value);
          } else if (key.startsWith('data-')) {
            el.setAttribute(key, value);
          } else {
            el[key] = value;
          }
        });
        return this;
      },

      set(key, value) {
        this.elements.forEach(el => {
          if (key === 'html') {
            el.innerHTML = value;
          } else if (key === 'text') {
            el.textContent = value;
          } else {
            el[key] = value;
          }
        });
        return this;
      },

      on(event, handler) {
        this.elements.forEach(el => el.addEventListener(event, handler));
        return this;
      },

      off(event, handler) {
        this.elements.forEach(el => el.removeEventListener(event, handler));
        return this;
      },

      placeOn(parentSelector, index = -1) {
        const parents = document.querySelectorAll(parentSelector);

        parents.forEach(parent => {
          const children = Array.from(parent.children);
          const count = children.length;
          let position;

          if (index < 0) {
            position = Math.max(count + index, 0);
          } else {
            position = Math.min(index, count);
          }

          this.elements.forEach(el => {
            const clone = el.cloneNode(true);
            if (children[position]) {
              parent.insertBefore(clone, children[position]);
            } else {
              parent.appendChild(clone);
            }
          });
        });

        return this;
      },

      then(callback) {
        callback?.();
        return this;
      },
      catch() {
        return this;
      }
    };
  };

  // === Store Reativo ===
  frag.createStore = createStore;
  frag.watch = watch;

  // === HTTP Fetch Básico ===
  frag.http = {
    get(url, callback) {
      fetch(url)
        .then(res => res.json())
        .then(data => callback(null, data))
        .catch(err => callback(err));
    },
    post(url, body, callback) {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      .then(res => res.json())
      .then(data => callback(null, data))
      .catch(err => callback(err));
    }
  };

  // === Serialização de Formulários ===
  frag.form = {
    serialize(formElement) {
      const formData = new FormData(formElement);
      const obj = {};
      formData.forEach((value, key) => {
        obj[key] = value;
      });
      return obj;
    }
  };

  // === Cache de Templates ===
  frag.cache = {
    templates: {},
    set(name, html) {
      this.templates[name] = html;
    },
    get(name, data) {
      const html = this.templates[name];
      return html ? compileTemplate(html, data) : '';
    }
  };

  return frag;
})();

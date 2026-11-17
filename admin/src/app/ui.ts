// A tiny DOM builder and the shared bits of interface: notices, the unsaved-changes guard, fields.

type Child = Node | string | number | null | undefined | false | Child[];
interface Props {
  class?: string | (string | false | null | undefined)[];
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void }>;
  value?: string;
  checked?: boolean;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = Array.isArray(props.class) ? props.class.filter(Boolean).join(" ") : props.class;
    if (props.text !== undefined) el.textContent = props.text;
    for (const [name, value] of Object.entries(props.attrs ?? {})) {
      if (value === false || value === null || value === undefined) continue;
      el.setAttribute(name, value === true ? "" : String(value));
    }
    for (const [name, handler] of Object.entries(props.on ?? {})) el.addEventListener(name, handler as EventListener);
    if (props.value !== undefined) (el as unknown as HTMLInputElement).value = props.value;
    if (props.checked !== undefined) (el as unknown as HTMLInputElement).checked = props.checked;
  }
  append(el, children);
  return el;
}

function append(parent: Node, children: Child[]) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.appendChild(typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child);
  }
}

export const clear = (el: Element) => { while (el.firstChild) el.removeChild(el.firstChild); };
export const mount = (el: Element, ...children: Child[]) => { clear(el); append(el, children); };

// ------------------------------------------------------------------ messages
export function toast(message: string, kind: "ok" | "error" | "info" = "info", ms = 5000) {
  const region = document.getElementById("toasts")!;
  const el = h("div", { class: ["toast", `toast--${kind}`], attrs: { role: kind === "error" ? "alert" : "status" } }, message);
  region.appendChild(el);
  setTimeout(() => el.classList.add("is-leaving"), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export function problemsBox(title: string, problems: string[]) {
  return h("div", { class: "problems", attrs: { role: "alert" } },
    h("p", { class: "problems__title", text: title }),
    h("ul", null, problems.slice(0, 12).map((p) => h("li", { text: p }))),
    problems.length > 12 ? h("p", { text: `…and ${problems.length - 12} more.` }) : null);
}

// ------------------------------------------------------------------ unsaved changes
let dirty = false;
export const isDirty = () => dirty;
export function setDirty(value: boolean) {
  dirty = value;
  document.body.classList.toggle("has-changes", value);
}
window.addEventListener("beforeunload", (event) => {
  if (dirty) event.preventDefault();
});
export function confirmLeave(): boolean {
  if (!dirty) return true;
  if (window.confirm("You have unsaved changes. Leave without saving?")) { setDirty(false); return true; }
  return false;
}

// ------------------------------------------------------------------ form pieces
let fieldCount = 0;
export const nextId = (prefix = "f") => `${prefix}-${++fieldCount}`;

/** A labelled field wrapper. `control` must carry the id given in `id`. */
export function field(label: string, control: HTMLElement, opts: { id?: string; hint?: string | Node; wide?: boolean; error?: HTMLElement } = {}) {
  const id = opts.id ?? control.id;
  const hintId = opts.hint ? `${id}-hint` : undefined;
  if (hintId) control.setAttribute("aria-describedby", hintId);
  return h("div", { class: ["field", opts.wide && "field--wide"] },
    h("label", { class: "field__label", attrs: { for: id } }, label),
    control,
    opts.hint ? h("p", { class: "field__hint", attrs: { id: hintId } }, opts.hint) : null,
    opts.error ?? null);
}

export function input(value: string, attrs: Record<string, string | number | boolean | undefined> = {}, onInput?: (value: string) => void) {
  const el = h("input", { class: "input", attrs: { type: "text", id: nextId(), ...attrs }, value });
  el.addEventListener("input", () => { setDirty(true); onInput?.(el.value); });
  return el;
}
export function textarea(value: string, attrs: Record<string, string | number | boolean | undefined> = {}, onInput?: (value: string) => void) {
  const el = h("textarea", { class: "input input--area", attrs: { id: nextId(), rows: 6, ...attrs } });
  el.value = value;
  el.addEventListener("input", () => { setDirty(true); onInput?.(el.value); });
  return el;
}
export function select(options: { value: string; label: string }[], value: string, onChange?: (value: string) => void, attrs: Record<string, string | boolean> = {}) {
  const el = h("select", { class: "input input--select", attrs: { id: nextId(), ...attrs } }, options.map((o) => h("option", { attrs: { value: o.value }, text: o.label })));
  el.value = value;
  el.addEventListener("change", () => { setDirty(true); onChange?.(el.value); });
  return el;
}

export function button(label: string | Node, onClick: (event: MouseEvent) => void, kind: "primary" | "secondary" | "quiet" | "danger" = "secondary", attrs: Record<string, string | boolean> = {}) {
  return h("button", { class: ["btn", `btn--${kind}`], attrs: { type: "button", ...attrs }, on: { click: onClick } }, label);
}
export const link = (label: string, href: string, cls = "link") => h("a", { class: cls, attrs: { href } }, label);
export const external = (label: string, href: string, cls = "link") => h("a", { class: [cls, "link--external"], attrs: { href, target: "_blank", rel: "noopener" } }, label, h("span", { class: "sr-only", text: " (opens in a new tab)" }));

export function badge(text: string, tone: "warn" | "ok" | "muted" | "info" = "muted") {
  return h("span", { class: ["badge", `badge--${tone}`], text });
}

/** The sticky save bar at the bottom of an edit page. */
export function saveBar(onSave: () => Promise<void>, onDiscard: () => void, label = "Save and publish") {
  const status = h("span", { class: "savebar__status", attrs: { role: "status" } }, "Unsaved changes");
  const save = button(label, async () => {
    save.disabled = true;
    save.textContent = "Saving…";
    try { await onSave(); } finally { save.disabled = false; save.textContent = label; }
  }, "primary");
  return h("div", { class: "savebar" }, h("div", { class: "savebar__inner" }, status, h("div", { class: "savebar__actions" }, button("Discard changes", onDiscard, "quiet"), save)));
}

export function pageHead(title: string, ...extra: Child[]) {
  return h("header", { class: "page-head" }, h("h1", { class: "page-head__title", text: title }), extra.length ? h("div", { class: "page-head__extra" }, extra) : null);
}

export function card(title: string | null, ...children: Child[]) {
  return h("section", { class: "card" }, title ? h("h2", { class: "card__title", text: title }) : null, children);
}

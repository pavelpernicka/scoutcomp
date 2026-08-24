/** Translate server-provided catalogue metadata while retaining a safe fallback. */
export function translateServerValue(t, i18n, key, fallback = "") {
  return key && i18n.exists(key) ? t(key) : fallback;
}

export function localizeWidget(widget, t, i18n) {
  if (!widget) return widget;
  return {
    ...widget,
    title: translateServerValue(t, i18n, widget.title_key, widget.title),
    text: translateServerValue(t, i18n, widget.text_key, widget.text),
  };
}

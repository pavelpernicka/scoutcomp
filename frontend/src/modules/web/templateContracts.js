export const TEMPLATE_USAGE_MODES = {
  linkedLayout: "linked_layout",
  copyOnCreate: "copy_on_create",
};

const itemsFrom = (value) => Array.isArray(value) ? value : value?.items || [];

export const getTemplateUsageMode = (template = {}) => (
  template.usage_mode || TEMPLATE_USAGE_MODES.linkedLayout
);

export const templatesForUsage = (value, usageMode) => (
  itemsFrom(value).filter((template) => getTemplateUsageMode(template) === usageMode)
);

export const templatePersistenceFields = (template = {}) => ({
  template_kind: template.template_kind || "layout",
  usage_mode: getTemplateUsageMode(template),
});

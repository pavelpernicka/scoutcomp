import PropTypes from "prop-types";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { getComponentDisplayName, getComponentTechnicalName } from "./componentDisplayName";

export default function EditorBreadcrumbs({ selected, onSelect }) {
  const { t } = useTranslation();
  const path = useMemo(() => {
    const nodes = [];
    let node = selected;
    while (node) {
      nodes.unshift(node);
      node = node.parent?.();
    }
    return nodes;
  }, [selected]);

  return <nav className="web-editor-breadcrumbs" aria-label={t("web.editor.breadcrumbs")}>{path.map((node, index) => <span key={node.cid || index}>
    {index > 0 && <i className="fas fa-chevron-right" />}
    <button type="button" title={getComponentTechnicalName(node)} onClick={() => onSelect(node)}>{getComponentDisplayName(node, t)}</button>
  </span>)}</nav>;
}

EditorBreadcrumbs.propTypes = { selected: PropTypes.object, onSelect: PropTypes.func.isRequired };

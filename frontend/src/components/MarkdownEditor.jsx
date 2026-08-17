import PropTypes from "prop-types";

import RichTextEditor from "./RichTextEditor";

/** @deprecated Kept as a compatibility alias; new content is rich HTML. */
export default function MarkdownEditor({ rows, ...props }) {
  return <RichTextEditor {...props} height={Math.max(240, (rows || 10) * 28)} />;
}

MarkdownEditor.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  rows: PropTypes.number,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
};

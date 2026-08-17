import PropTypes from "prop-types";

import RichTextEditor from "../../../components/RichTextEditor";

/** Backwards-compatible CMS entry point for the shared rich-text editor. */
export default function ArticleEditBox(props) {
  return <RichTextEditor {...props} className="article-editbox" />;
}

ArticleEditBox.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

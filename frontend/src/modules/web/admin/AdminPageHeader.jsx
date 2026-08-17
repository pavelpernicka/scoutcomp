import PropTypes from "prop-types";
import "./AdminPageHeader.css";

export default function AdminPageHeader({ title, description, action }) {
  return (
    <div className="web-admin-page-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

AdminPageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  action: PropTypes.node,
};

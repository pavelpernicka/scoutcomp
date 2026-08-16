import PropTypes from "prop-types";
import WebAdminLayout from "./admin/WebAdminLayout";

export default function WebAdminRoute({ children }) {
  return <WebAdminLayout>{children}</WebAdminLayout>;
}

WebAdminRoute.propTypes = { children: PropTypes.node.isRequired };

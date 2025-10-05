import PropTypes from 'prop-types';

const FormField = ({
  label,
  icon,
  error,
  help,
  required = false,
  children,
  className = '',
  labelClassName = '',
  ...props
}) => {
  return (
    <div className={`mb-3 ${className}`} {...props}>
      {label && (
        <label className={`form-label ${required ? 'fw-bold' : ''} ${labelClassName}`}>
          {icon && <span className="me-2">{icon}</span>}
          {label}
          {required && <span className="text-danger ms-1">*</span>}
        </label>
      )}
      {children}
      {help && <div className="form-text">{help}</div>}
      {error && <div className="invalid-feedback d-block">{error}</div>}
    </div>
  );
};

FormField.propTypes = {
  label: PropTypes.string,
  icon: PropTypes.node,
  error: PropTypes.string,
  help: PropTypes.string,
  required: PropTypes.bool,
  children: PropTypes.node,
  className: PropTypes.string,
  labelClassName: PropTypes.string
};

export default FormField;
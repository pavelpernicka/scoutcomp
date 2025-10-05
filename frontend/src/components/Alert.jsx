import PropTypes from 'prop-types';

const Alert = ({
  type = 'info',
  children,
  onDismiss,
  icon,
  className = '',
  ...props
}) => {
  const getIcon = () => {
    if (icon) return icon;

    switch (type) {
      case 'success':
        return <i className="fas fa-check-circle me-2"></i>;
      case 'danger':
      case 'error':
        return <i className="fas fa-exclamation-circle me-2"></i>;
      case 'warning':
        return <i className="fas fa-exclamation-triangle me-2"></i>;
      case 'info':
      default:
        return <i className="fas fa-info-circle me-2"></i>;
    }
  };

  return (
    <div
      className={`alert alert-${type} ${onDismiss ? 'alert-dismissible' : ''} ${className}`}
      role="alert"
      {...props}
    >
      <div className="d-flex align-items-center">
        {getIcon()}
        <div className="flex-grow-1">{children}</div>
        {onDismiss && (
          <button
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={onDismiss}
          ></button>
        )}
      </div>
    </div>
  );
};

Alert.propTypes = {
  type: PropTypes.oneOf(['info', 'success', 'warning', 'danger', 'error']),
  children: PropTypes.node,
  onDismiss: PropTypes.func,
  icon: PropTypes.node,
  className: PropTypes.string,
};

export default Alert;
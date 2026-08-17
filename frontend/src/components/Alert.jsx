import PropTypes from 'prop-types';
import Toast from './Toast';

const Alert = ({
  type = 'info',
  children,
  onDismiss,
  icon,
  className = '',
  toast,
  duration,
  ...props
}) => {
  // Dismissible operation feedback should not move page content. Errors that
  // explain a field or an unavailable view deliberately remain inline.
  if (toast ?? Boolean(onDismiss)) {
    return <Toast type={type} icon={icon} onDismiss={onDismiss} duration={duration}>{children}</Toast>;
  }
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
  toast: PropTypes.bool,
  duration: PropTypes.number,
};

export default Alert;

import PropTypes from 'prop-types';

const Button = ({
  variant = 'primary',
  size,
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  children,
  className = '',
  style,
  gradient,
  ...props
}) => {
  const getVariantClass = () => {
    if (gradient) return '';
    return `btn-${variant}`;
  };

  const getSizeClass = () => {
    return size ? `btn-${size}` : '';
  };

  const getStyle = () => {
    if (gradient) {
      return {
        background: gradient,
        border: 'none',
        ...style
      };
    }
    return style;
  };

  const renderIcon = () => {
    if (loading) {
      return <i className="fas fa-spinner fa-spin"></i>;
    }
    if (typeof icon === 'string') {
      return <i className={icon}></i>;
    }
    return icon;
  };

  return (
    <button
      className={`btn ${getVariantClass()} ${getSizeClass()} ${className}`}
      disabled={disabled || loading}
      style={getStyle()}
      {...props}
    >
      {iconPosition === 'left' && renderIcon() && (
        <span className={children ? 'me-2' : ''}>{renderIcon()}</span>
      )}
      {children}
      {iconPosition === 'right' && renderIcon() && (
        <span className={children ? 'ms-2' : ''}>{renderIcon()}</span>
      )}
    </button>
  );
};

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'light', 'dark', 'outline-primary', 'outline-secondary', 'outline-success', 'outline-danger', 'outline-warning', 'outline-info', 'outline-light', 'outline-dark']),
  size: PropTypes.oneOf(['sm', 'lg']),
  icon: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  iconPosition: PropTypes.oneOf(['left', 'right']),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  children: PropTypes.node,
  className: PropTypes.string,
  style: PropTypes.object,
  gradient: PropTypes.string
};

export default Button;
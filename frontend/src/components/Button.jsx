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

export default Button;
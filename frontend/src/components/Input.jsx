const Input = ({
  type = 'text',
  error,
  icon,
  iconPosition = 'left',
  className = '',
  ...props
}) => {
  const inputClass = [
    'form-control',
    error && 'is-invalid',
    className
  ].filter(Boolean).join(' ');

  if (icon) {
    return (
      <div className="input-group">
        {iconPosition === 'left' && (
          <span className="input-group-text">
            {typeof icon === 'string' ? <i className={icon}></i> : icon}
          </span>
        )}
        <input
          type={type}
          className={inputClass}
          {...props}
        />
        {iconPosition === 'right' && (
          <span className="input-group-text">
            {typeof icon === 'string' ? <i className={icon}></i> : icon}
          </span>
        )}
      </div>
    );
  }

  return (
    <input
      type={type}
      className={inputClass}
      {...props}
    />
  );
};

export default Input;
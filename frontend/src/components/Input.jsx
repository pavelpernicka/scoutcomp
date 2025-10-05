import PropTypes from 'prop-types';

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

Input.propTypes = {
  type: PropTypes.string,
  error: PropTypes.string,
  icon: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  iconPosition: PropTypes.oneOf(['left', 'right']),
  className: PropTypes.string
};

export default Input;
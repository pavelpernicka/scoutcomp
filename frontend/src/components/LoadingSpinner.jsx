import PropTypes from 'prop-types';

const LoadingSpinner = ({
  size = 'normal',
  text = 'Loading...',
  className = '',
  centered = true
}) => {
  const spinnerClass = size === 'small' ? 'spinner-border-sm' : '';
  const containerClass = centered ? 'text-center' : '';

  return (
    <div className={`${containerClass} ${className}`}>
      <div className={`spinner-border ${spinnerClass}`} role="status">
        <span className="visually-hidden">{text}</span>
      </div>
      {text && size !== 'small' && (
        <div className="mt-2 text-muted">{text}</div>
      )}
    </div>
  );
};

LoadingSpinner.propTypes = {
  size: PropTypes.oneOf(['small', 'normal']),
  text: PropTypes.string,
  className: PropTypes.string,
  centered: PropTypes.bool
};

export default LoadingSpinner;
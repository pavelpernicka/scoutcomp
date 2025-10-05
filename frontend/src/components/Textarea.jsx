import PropTypes from 'prop-types';

const Textarea = ({
  error,
  className = '',
  rows = 4,
  ...props
}) => {
  const textareaClass = [
    'form-control',
    error && 'is-invalid',
    className
  ].filter(Boolean).join(' ');

  return (
    <textarea
      rows={rows}
      className={textareaClass}
      {...props}
    />
  );
};

Textarea.propTypes = {
  error: PropTypes.string,
  className: PropTypes.string,
  rows: PropTypes.number
};

export default Textarea;
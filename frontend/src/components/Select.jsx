const Select = ({
  options = [],
  error,
  placeholder = 'Select...',
  className = '',
  ...props
}) => {
  const selectClass = [
    'form-select',
    error && 'is-invalid',
    className
  ].filter(Boolean).join(' ');

  return (
    <select className={selectClass} {...props}>
      {placeholder && (
        <option value="">{placeholder}</option>
      )}
      {options.map((option, index) => (
        <option key={index} value={option.value || option}>
          {option.label || option}
        </option>
      ))}
    </select>
  );
};

export default Select;
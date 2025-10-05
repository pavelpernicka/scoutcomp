const Card = ({
  title,
  subtitle,
  icon,
  children,
  header,
  footer,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  footerClassName = '',
  shadow = true,
  border = true,
  ...props
}) => {
  const cardClasses = [
    'card',
    shadow && 'shadow-lg',
    !border && 'border-0',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} {...props}>
      {(header || title || icon) && (
        <div className={`card-header ${headerClassName}`}>
          {header || (
            <div className="d-flex align-items-center gap-2">
              {icon && <span className="fs-4">{icon}</span>}
              <div>
                {title && <h5 className="mb-0">{title}</h5>}
                {subtitle && <small className="text-muted">{subtitle}</small>}
              </div>
            </div>
          )}
        </div>
      )}
      <div className={`card-body ${bodyClassName}`}>
        {children}
      </div>
      {footer && (
        <div className={`card-footer ${footerClassName}`}>
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
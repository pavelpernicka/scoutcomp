const DecoratedCard = ({
  // Header content
  title,
  subtitle,
  icon,

  // Header styling
  headerGradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  headerClassName = '',

  // Right side content
  rightContent,
  rightBadge, // Shorthand for simple badge

  // Card styling
  shadow = true,
  border = true,
  className = '',
  style,

  // Body content
  children,
  bodyClassName = '',
  bodyStyle,

  // Advanced options
  headerOverflow = true, // overflow-hidden on header
  headerPosition = 'relative', // position-relative on header

  // Optional props
  ...props
}) => {
  // Build header content
  const renderHeader = () => (
    <div
      className={`card-header text-white ${headerPosition ? 'position-' + headerPosition : ''} ${headerOverflow ? 'overflow-hidden' : ''} ${headerClassName}`}
      style={{ background: headerGradient }}
    >
      <div className="d-flex justify-content-between align-items-center position-relative">
        <div className="d-flex align-items-center gap-3">
          {icon && (
            <span className={typeof icon === 'string' && icon.length <= 2 ? 'fs-2' : ''}>
              {typeof icon === 'string' ? icon : icon}
            </span>
          )}
          <div>
            {title && <h4 className="mb-1">{title}</h4>}
            {subtitle && <p className="mb-0 opacity-90">{subtitle}</p>}
          </div>
        </div>

        {(rightContent || rightBadge) && (
          <div className="text-end">
            {rightBadge && (
              <span className="badge bg-white text-dark px-3 py-2 fs-6">
                {rightBadge}
              </span>
            )}
            {rightContent}
          </div>
        )}
      </div>
    </div>
  );

  // Build card classes
  const cardClasses = [
    'card',
    shadow && 'shadow-lg',
    !border && 'border-0',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} style={style} {...props}>
      {(title || subtitle || icon || rightContent || rightBadge) && renderHeader()}

      {children && (
        <div className={`card-body ${bodyClassName}`} style={bodyStyle}>
          {children}
        </div>
      )}
    </div>
  );
};

export default DecoratedCard;
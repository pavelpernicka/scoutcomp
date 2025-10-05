const Modal = ({
  isVisible,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'lg',
  headerStyle,
  headerGradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  className = '',
  ...props
}) => {
  if (!isVisible) return null;

  const modalSizeClass = size ? `modal-${size}` : '';

  return (
    <>
      <div className="modal fade show d-block" role="dialog" tabIndex="-1" {...props}>
        <div className={`modal-dialog ${modalSizeClass}`} role="document">
          <div className={`modal-content border-0 shadow-lg ${className}`}>
            <div
              className="modal-header text-white"
              style={headerStyle || { background: headerGradient }}
            >
              <div className="d-flex align-items-center gap-2">
                {icon && <span className="fs-3">{icon}</span>}
                <div>
                  <h5 className="modal-title mb-0">{title}</h5>
                  {subtitle && <small className="opacity-90">{subtitle}</small>}
                </div>
              </div>
              <button
                type="button"
                className="btn-close btn-close-white"
                aria-label="Close"
                onClick={onClose}
              ></button>
            </div>
            <div className="modal-body p-4">
              {children}
            </div>
            {footer && (
              <div className="modal-footer">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show"></div>
    </>
  );
};

export default Modal;
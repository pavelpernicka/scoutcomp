import { useEffect, useId, useRef } from 'react';
import PropTypes from 'prop-types';

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
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isVisible) return undefined;

    const previousFocus = document.activeElement;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusInitialControl = () => {
      const focusable = dialogRef.current?.querySelectorAll(focusableSelector);
      (focusable?.[0] || dialogRef.current)?.focus();
    };
    const timer = window.setTimeout(focusInitialControl, 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll(focusableSelector) || [])];
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const modalSizeClass = size ? `modal-${size}` : '';

  return (
    <>
      <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex="-1" {...props}>
        <div className={`modal-dialog ${modalSizeClass}`} role="document">
          <div ref={dialogRef} className={`modal-content border-0 shadow-lg ${className}`} tabIndex="-1">
            <div
              className="modal-header text-white"
              style={headerStyle || { background: headerGradient }}
            >
              <div className="d-flex align-items-center gap-2">
                {icon && <span className="fs-3">{icon}</span>}
                <div>
                  <h5 id={titleId} className="modal-title mb-0">{title}</h5>
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

Modal.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  subtitle: PropTypes.string,
  icon: PropTypes.node,
  children: PropTypes.node,
  footer: PropTypes.node,
  size: PropTypes.oneOf(['sm', 'lg', 'xl']),
  headerStyle: PropTypes.object,
  headerGradient: PropTypes.string,
  className: PropTypes.string
};

export default Modal;

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import './Modal.css';

// A small shared stack makes nested dialogs legible: every new dialog receives
// its own backdrop above the previous one, rather than competing at Bootstrap's
// single fixed z-index.
const modalStack = [];
let sequence = 0;

const Modal = ({
  isVisible, onClose, title, subtitle, icon, children, footer, size = 'lg',
  headerStyle, headerGradient, className = '', ...props
}) => {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const stackIdRef = useRef(null);
  const titleId = useId();
  const [stackPosition, setStackPosition] = useState(0);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isVisible) return undefined;
    const id = ++sequence;
    stackIdRef.current = id;
    modalStack.push(id);
    setStackPosition(modalStack.length - 1);
    const originalOverflow = document.body.style.overflow;
    if (modalStack.length === 1) document.body.style.overflow = 'hidden';
    return () => {
      const position = modalStack.indexOf(id);
      if (position !== -1) modalStack.splice(position, 1);
      if (!modalStack.length) document.body.style.overflow = originalOverflow;
    };
  }, [isVisible]);

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
      // Only the top dialog owns Escape and focus. This prevents a nested
      // confirmation from accidentally closing the editor beneath it.
      if (modalStack.at(-1) !== stackIdRef.current) return;
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll(focusableSelector) || [])];
      if (!focusable.length) { event.preventDefault(); dialogRef.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { window.clearTimeout(timer); document.removeEventListener('keydown', handleKeyDown); previousFocus?.focus?.(); };
  }, [isVisible, stackPosition]);

  if (!isVisible) return null;
  const zIndex = 1055 + stackPosition * 20;
  const content = (
    <>
      <div className="modal fade show d-block app-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex="-1" style={{ zIndex }} {...props}>
        <div className={`modal-dialog modal-dialog-scrollable ${size ? `modal-${size}` : ''}`} role="document">
          <div ref={dialogRef} className={`modal-content border-0 ${className}`} tabIndex="-1" data-custom-header={headerGradient ? 'true' : undefined}>
            <div className="modal-header" style={headerStyle || undefined}>
              <div className="d-flex align-items-center gap-2">
                {icon && <span className="fs-4" aria-hidden="true">{icon}</span>}
                <div><h2 id={titleId} className="modal-title h5 mb-0">{title}</h2>{subtitle && <small>{subtitle}</small>}</div>
              </div>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show app-modal-backdrop" style={{ zIndex: zIndex - 5 }} />
    </>
  );
  return createPortal(content, document.body);
};

Modal.propTypes = {
  isVisible: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, title: PropTypes.string,
  subtitle: PropTypes.string, icon: PropTypes.node, children: PropTypes.node, footer: PropTypes.node,
  size: PropTypes.oneOf(['sm', 'lg', 'xl']), headerStyle: PropTypes.object, headerGradient: PropTypes.string,
  className: PropTypes.string,
};

export default Modal;

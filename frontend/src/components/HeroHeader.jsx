import PropTypes from 'prop-types';

const HeroHeader = ({
  title,
  subtitle,
  icon,
  gradient,
  variant = 'default',
  children
}) => {
  const isAdmin = variant === 'admin';
  return (
    <div className={isAdmin ? 'admin-heading-wrap' : 'row mb-4'}>
      <div className={isAdmin ? undefined : 'col-12'}>
        <section className={`page-heading page-heading--${variant}`} style={gradient ? { '--page-accent': gradient } : undefined}>
          <div className="page-heading__body">
            <div className="row align-items-center">
              <div className="col-md-8">
                <div className="d-flex align-items-center mb-2">
                  {icon && <span className="fs-1 me-3">{icon}</span>}
                  <div>
                    <h1 className="mb-1">{title}</h1>
                    {subtitle && <p className="mb-0">{subtitle}</p>}
                  </div>
                </div>
              </div>
              {children && (
                <div className="col-md-4 text-md-end">
                  {children}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

HeroHeader.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  icon: PropTypes.node,
  gradient: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'admin']),
  children: PropTypes.node
};

export default HeroHeader;

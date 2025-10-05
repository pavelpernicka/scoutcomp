import PropTypes from 'prop-types';

const HeroHeader = ({
  title,
  subtitle,
  icon,
  gradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  children
}) => {
  return (
    <div className="row mb-4">
      <div className="col-12">
        <div className="card shadow-lg border-0">
          <div className="card-body text-white position-relative overflow-hidden" style={{ background: gradient }}>
            <div className="row align-items-center">
              <div className="col-md-8">
                <div className="d-flex align-items-center mb-2">
                  {icon && <span className="fs-1 me-3">{icon}</span>}
                  <div>
                    <h1 className="mb-1">{title}</h1>
                    {subtitle && <p className="mb-0 opacity-90 fs-5">{subtitle}</p>}
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
        </div>
      </div>
    </div>
  );
};

HeroHeader.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  icon: PropTypes.node,
  gradient: PropTypes.string,
  children: PropTypes.node
};

export default HeroHeader;
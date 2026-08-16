import PropTypes from "prop-types";

const initialsOf = (name) => {
  const parts = (name || "?").trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
};

function UserAvatar({ user, size = 40, fallbackClass = "bg-secondary", className = "" }) {
  const name = user?.real_name || user?.username || "?";
  const src = user?.avatar;
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(11, Math.round(size * 0.38)),
  };

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`rounded-circle object-fit-cover flex-shrink-0 ${className}`}
        style={style}
      />
    );
  }

  return (
    <span
      className={`${fallbackClass} rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 text-white ${className}`}
      style={style}
    >
      {initialsOf(name)}
    </span>
  );
}

UserAvatar.propTypes = {
  user: PropTypes.object,
  size: PropTypes.number,
  fallbackClass: PropTypes.string,
  className: PropTypes.string,
};

export default UserAvatar;

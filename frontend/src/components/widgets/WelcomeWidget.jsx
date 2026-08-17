import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import api from "../../services/api";
import { useAuth } from "../../providers/AuthProvider";

function WelcomeStats() {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const { data: scoreboard = {} } = useQuery({
    queryKey: ["leaderboard", "me"],
    queryFn: async () => {
      const { data } = await api.get("/leaderboard/me");
      return data;
    },
    enabled: Boolean(profile),
    staleTime: 30_000,
  });

  const totalPoints = scoreboard?.total_points ?? 0;
  const memberRank = scoreboard?.member_rank ?? "–";
  const teamRank = scoreboard?.team_rank ?? "–";

  return (
    <div className="row g-3">
      <div className="col-6 col-lg-3">
        <div className="dashboard-welcome-stat">
          <div className="fs-5 fw-bold">{totalPoints}</div>
          <small className="opacity-90">{t("dashboard.totalPoints")}</small>
        </div>
      </div>
      {memberRank !== "–" && (
        <div className="col-6 col-lg-3">
          <div className="dashboard-welcome-stat">
            <div className="fs-5 fw-bold">#{memberRank}</div>
            <small className="opacity-90">{t("dashboard.yourRank")}</small>
          </div>
        </div>
      )}
      {teamRank !== "–" && (
        <div className="col-6 col-lg-3">
          <div className="dashboard-welcome-stat">
            <div className="fs-5 fw-bold">#{teamRank}</div>
            <small className="opacity-90">{t("dashboard.teamRank")}</small>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WelcomeWidget({ widget }) {
  const { t } = useTranslation();
  const { profile } = useAuth();

  if (widget?.stats) {
    return (
      <section className="dashboard-welcome">
        <div className="d-flex align-items-center mb-3">
          <span className="fs-1 me-3">👋</span>
          <div>
            <h1 className="display-6 fw-bold mb-0">
              {t("dashboard.welcome", { username: profile?.user?.real_name || profile?.user?.username })}
            </h1>
            {profile?.user?.team_name ? (
              <p className="lead mb-0 opacity-75">{t("dashboard.teamPride", { teamName: profile.user.team_name })}</p>
            ) : (
              profile?.user?.team_id === null && <p className="lead mb-0 opacity-75">{t("dashboard.welcomeNoGroup")}</p>
            )}
          </div>
        </div>
        <WelcomeStats />
      </section>
    );
  }

  return (
    <section className="dashboard-welcome">
      <div className="d-flex align-items-center">
        <i className={`fas ${widget?.icon || "fa-house-user"} fs-1 me-3`}></i>
        <div>
          <h1 className="display-6 fw-bold mb-0">{widget?.title || t("dashboard.welcome", { username: profile?.user?.real_name || profile?.user?.username })}</h1>
          {widget?.text && <p className="lead mb-0 opacity-75">{widget.text}</p>}
        </div>
      </div>
    </section>
  );
}

WelcomeWidget.propTypes = {
  widget: PropTypes.shape({
    stats: PropTypes.bool,
    title: PropTypes.string,
    text: PropTypes.string,
    icon: PropTypes.string,
  }),
};

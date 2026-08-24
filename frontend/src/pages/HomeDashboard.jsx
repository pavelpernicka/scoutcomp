import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import api from "../services/api";
import { useAuth } from "../providers/AuthProvider";
import ActivityWidget from "../components/widgets/ActivityWidget";
import AnnouncementsWidget from "../components/widgets/AnnouncementsWidget";
import ProgressWidget from "../components/widgets/ProgressWidget";
import MessagesWidget from "../components/widgets/MessagesWidget";
import WelcomeWidget from "../components/widgets/WelcomeWidget";
import PlannedEventsWidget from "../components/widgets/PlannedEventsWidget";
import PostsWidget from "../components/widgets/PostsWidget";
import { localizeWidget } from "../utils/serverTranslations";

const WIDGET_COMPONENTS = {
  welcome: WelcomeWidget,
  activity: ActivityWidget,
  progress: ProgressWidget,
  messages: MessagesWidget,
  announcements: AnnouncementsWidget,
  planned_events: PlannedEventsWidget,
  posts: PostsWidget,
};

function DashboardWidget({ widget, className = "col-12" }) {
  const { t, i18n } = useTranslation();
  if (!widget) return null;
  const translatedWidget = localizeWidget(widget, t, i18n);
  const WidgetComponent = WIDGET_COMPONENTS[translatedWidget.component];
  return <div className={className}>
    {WidgetComponent ? <WidgetComponent widget={translatedWidget} /> : (
      <Link to={translatedWidget.route} className="card dashboard-link-tile h-100 shadow-sm text-decoration-none text-dark">
        <div className="card-body"><i className={`fas ${translatedWidget.icon} fs-3 text-primary mb-3`} /><h2 className="h5">{translatedWidget.title}</h2><p className="text-muted mb-0">{translatedWidget.text}</p></div>
      </Link>
    )}
  </div>;
}

DashboardWidget.propTypes = {
  widget: PropTypes.shape({
    component: PropTypes.string, route: PropTypes.string, icon: PropTypes.string,
    title: PropTypes.string, text: PropTypes.string,
  }),
  className: PropTypes.string,
};

/** Deliberately ordered dashboard: core context first, then competition work. */
export default function HomeDashboard() {
  const { profile } = useAuth();
  const { data: widgets = [] } = useQuery({
    queryKey: ["widgets"],
    queryFn: async () => (await api.get("/widgets")).data,
    staleTime: 60_000,
    enabled: Boolean(profile),
  });
  const byId = Object.fromEntries(widgets.map((widget) => [widget.id, widget]));
  const used = new Set([
    "core.welcome", "competitions.welcome", "core.posts", "core.planned_events", "core.messages",
    "competitions.activity", "competitions.progress", "competitions.tasks", "competitions.leaderboard", "competitions.announcements",
  ]);

  return <div className="dashboard-page d-flex flex-column gap-4">
    <DashboardWidget widget={byId["core.welcome"]} />
    <DashboardWidget widget={byId["competitions.welcome"]} />
    <DashboardWidget widget={byId["core.posts"]} />

    {(byId["core.planned_events"] || byId["core.messages"]) && <div className="row g-4 dashboard-primary-row">
      <DashboardWidget widget={byId["core.planned_events"]} className="col-12 col-xl-8" />
      <DashboardWidget widget={byId["core.messages"]} className="col-12 col-xl-4" />
    </div>}

    <div className="row g-4">
      <DashboardWidget widget={byId["competitions.activity"]} className="col-12 col-md-6 col-xl-3" />
      <DashboardWidget widget={byId["competitions.progress"]} className="col-12 col-md-6 col-xl-3" />
      <DashboardWidget widget={byId["competitions.tasks"]} className="col-12 col-md-6 col-xl-3" />
      <DashboardWidget widget={byId["competitions.leaderboard"]} className="col-12 col-md-6 col-xl-3" />
    </div>
    <DashboardWidget widget={byId["competitions.announcements"]} />

    {widgets.filter((widget) => !used.has(widget.id)).length > 0 && <div className="row g-4">
      {widgets.filter((widget) => !used.has(widget.id)).map((widget) => <DashboardWidget key={widget.id} widget={widget} className={widget.width || "col-12 col-md-6 col-xl-4"} />)}
    </div>}
  </div>;
}

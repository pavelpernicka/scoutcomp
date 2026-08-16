import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import api from "../services/api";
import { useAuth } from "../providers/AuthProvider";
import ActivityWidget from "../components/widgets/ActivityWidget";
import AnnouncementsWidget from "../components/widgets/AnnouncementsWidget";
import ProgressWidget from "../components/widgets/ProgressWidget";
import MessagesWidget from "../components/widgets/MessagesWidget";
import WelcomeWidget from "../components/widgets/WelcomeWidget";
import PlannedEventsWidget from "../components/widgets/PlannedEventsWidget";

const WIDGET_COMPONENTS = {
  welcome: WelcomeWidget,
  activity: ActivityWidget,
  progress: ProgressWidget,
  messages: MessagesWidget,
  announcements: AnnouncementsWidget,
  planned_events: PlannedEventsWidget,
};

export default function HomeDashboard() {
  const { profile } = useAuth();

  const { data: widgets = [] } = useQuery({
    queryKey: ["widgets"],
    queryFn: async () => (await api.get("/widgets")).data,
    staleTime: 60_000,
    enabled: Boolean(profile),
  });

  return (
    <div className="row g-4">
      {widgets.map((widget) => {
        const WidgetComponent = WIDGET_COMPONENTS[widget.component];
        return (
          <div className={widget.width || "col-12 col-md-6 col-xl-4"} key={widget.id}>
            {WidgetComponent ? (
              <WidgetComponent widget={widget} />
            ) : (
              <Link to={widget.route} className="card h-100 shadow-sm text-decoration-none text-dark">
                <div className="card-body">
                  <i className={`fas ${widget.icon} fs-3 text-primary mb-3`} />
                  <h2 className="h5">{widget.title}</h2>
                  <p className="text-muted mb-0">{widget.text}</p>
                </div>
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

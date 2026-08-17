import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import api from "../../services/api";
import { parseServerDate } from "../../utils/dateUtils";
import MediaPreview from "../../modules/web/media/MediaPreview";
import DecoratedCard from "../DecoratedCard";
import UserAvatar from "../UserAvatar";
import DashboardWidgetIcon from "./DashboardWidgetIcon";

import "./PostsWidget.css";

const formatDate = (value) => {
  const date = parseServerDate(value);
  return date ? date.toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" }) : "";
};

/** Large vertical news feed for the dashboard. */
export default function PostsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["posts", "feed", "widget"],
    queryFn: async () => (await api.get("/web/posts/feed", { params: { limit: 4 } })).data,
    staleTime: 30_000,
  });
  const posts = data?.items || [];
  return <DecoratedCard title="Poslední příspěvky" subtitle="Novinky oddílu" icon={<DashboardWidgetIcon><i className="fas fa-newspaper" /></DashboardWidgetIcon>} rightContent={<Link to="/posts" className="btn btn-sm btn-outline-primary dashboard-post-history-link"><i className="fas fa-clock-rotate-left" aria-hidden="true" /><span className="d-none d-sm-inline ms-1">Celá historie</span><span className="d-sm-none ms-1">Historie</span></Link>} className="dashboard-posts-widget" bodyClassName="p-0">
    {isLoading ? <div className="p-4 text-muted">Načítám příspěvky…</div> : posts.length === 0 ? <div className="p-4 text-muted">Zatím nebyl publikován žádný příspěvek.</div> : <div className="dashboard-posts-vertical">
      {posts.map((post) => <article className="dashboard-post-card" key={post.id}>
        <Link to={`/posts/${post.id}`} className="dashboard-post-link text-decoration-none text-reset h-100">
          {post.cover_media_id ? <MediaPreview src={`/api/web/media/${post.cover_media_id}/file`} alt="" className="dashboard-post-cover" fallback={<div className="dashboard-post-cover dashboard-post-placeholder"><i className="fas fa-image" /></div>} /> : <div className="dashboard-post-cover dashboard-post-placeholder"><i className="fas fa-newspaper" /></div>}
          <div className="dashboard-post-content d-flex flex-column justify-content-center">
            <div className="dashboard-post-meta text-muted">
              <UserAvatar user={{ real_name: post.author, avatar: post.author_avatar }} size={26} fallbackClass="bg-success" />
              <span className="dashboard-post-author">{post.author || "Oddíl"}</span>
              <span className="dashboard-post-meta-separator" aria-hidden>·</span>
              <time className="dashboard-post-date">{formatDate(post.published_at)}</time>
            </div>
            <h3 className="dashboard-post-title">{post.title}</h3>
            {post.excerpt && <p className="dashboard-post-excerpt mb-0">{post.excerpt}</p>}
            <span className="dashboard-post-read">Přečíst příspěvek <i className="fas fa-arrow-right" /></span>
          </div>
        </Link>
      </article>)}
    </div>}
  </DecoratedCard>;
}

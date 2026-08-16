import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import api from "../../services/api";
import { parseServerDate } from "../../utils/dateUtils";
import MediaPreview from "../../modules/web/media/MediaPreview";
import DecoratedCard from "../DecoratedCard";
import UserAvatar from "../UserAvatar";

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
  return <DecoratedCard title="Poslední příspěvky" subtitle="Novinky oddílu" icon={<i className="fas fa-newspaper" />} rightContent={<Link to="/posts" className="btn btn-sm btn-outline-primary">Celá historie</Link>} bodyClassName="p-0">
    {isLoading ? <div className="p-4 text-muted">Načítám příspěvky…</div> : posts.length === 0 ? <div className="p-4 text-muted">Zatím nebyl publikován žádný příspěvek.</div> : <div className="dashboard-posts-vertical">
      {posts.map((post) => <article className="dashboard-post-card" key={post.id}>
        <Link to={`/posts/${post.id}`} className="text-decoration-none text-reset d-flex flex-column flex-md-row h-100">
          {post.cover_media_id ? <MediaPreview src={`/api/web/media/${post.cover_media_id}/file`} alt="" className="dashboard-post-cover" fallback={<div className="dashboard-post-cover dashboard-post-placeholder"><i className="fas fa-image" /></div>} /> : <div className="dashboard-post-cover dashboard-post-placeholder"><i className="fas fa-newspaper" /></div>}
          <div className="dashboard-post-content p-3 p-lg-4 d-flex flex-column justify-content-center">
            <div className="d-flex align-items-center gap-2 small text-muted mb-2"><UserAvatar user={{ real_name: post.author, avatar: post.author_avatar }} size={26} fallbackClass="bg-success" /><span>{post.author || "Oddíl"}</span><span aria-hidden>·</span><time>{formatDate(post.published_at)}</time></div>
            <h3 className="dashboard-post-title mb-2">{post.title}</h3>
            {post.excerpt && <p className="text-muted mb-0 dashboard-post-excerpt">{post.excerpt}</p>}
          </div>
        </Link>
      </article>)}
    </div>}
  </DecoratedCard>;
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import LoadingSpinner from "../components/LoadingSpinner";
import HeroHeader from "../components/HeroHeader";
import UserAvatar from "../components/UserAvatar";
import MediaPreview from "../modules/web/media/MediaPreview";
import api from "../services/api";
import { parseServerDate } from "../utils/dateUtils";
import RichTextContent from "../components/RichTextContent";

const formatDate = (value, locale, options = {}) => {
  const date = parseServerDate(value);
  return date ? date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", ...options }) : "";
};

const plainTextExcerpt = (value, maxLength = 220) => {
  if (!value) return "";
  const parser = new DOMParser();
  const document = parser.parseFromString(String(value), "text/html");
  document.querySelectorAll("script, style, noscript, svg, template").forEach((element) => element.remove());
  const text = (document.body.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
};

function EventInfoBox({ event }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "cs" ? "cs-CZ" : "en-US";
  const queryClient = useQueryClient();
  const attendanceMutation = useMutation({
    mutationFn: async (status) => (await api.post(`/activity/events/${event.id}/planned`, { status })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts", "feed"] }),
  });
  const registration = attendanceMutation.data || {
    status: event.planned_status || "unknown",
    created_at: event.planned_registered_at,
  };
  const selection = registration.status;
  const registrationLabel = selection === "attending" ? t("calendar.registered") : selection === "not_attending" ? t("calendar.excused") : null;
  const deadlinePassed = event.planned_deadline && parseServerDate(event.planned_deadline) < new Date();
  const descriptionExcerpt = plainTextExcerpt(event.description);
  const choices = [
    ["attending", "btn-success", "fa-check", t("calendar.attending")],
    ["not_attending", "btn-warning", "fa-xmark", t("calendar.not_attending")],
    ["unknown", "btn-outline-secondary", "fa-question", t("calendar.unknownAttendance")],
  ];

  return <aside className="post-event-info rounded border p-3 my-4" aria-label={t("posts.relatedEvent")}>
    <div className="d-flex align-items-start gap-3"><span className="post-event-icon"><i className="fas fa-calendar-check" /></span><div className="flex-grow-1"><div className="small text-uppercase fw-semibold text-primary">{t("posts.relatedEvent")}</div><h2 className="h5 mb-1">{event.title}</h2><div className="small text-muted">{formatDate(event.starts_at, locale, { weekday: "long" })}{event.location ? ` · ${event.location}` : ""}</div>{descriptionExcerpt && <p className="mb-0 mt-2 small">{descriptionExcerpt}</p>}</div></div>
    {event.requires_planned && <><div className="alert alert-info py-2 small my-3 mb-0"><i className="fas fa-circle-info me-2" />{deadlinePassed ? t("posts.registrationClosed") : t("posts.chooseAttendance")}{event.planned_deadline && !deadlinePassed && <> {t("posts.registrationDeadline", { date: formatDate(event.planned_deadline, locale) })}</>}</div>
      {!deadlinePassed && <div className="post-event-choice-group btn-group mt-3" role="group" aria-label={t("calendar.eventAttendance", { title: event.title })}>{choices.map(([status, className, icon, label]) => <button key={status} className={`btn btn-sm ${selection === status ? className : "btn-outline-secondary"}`} type="button" disabled={attendanceMutation.isPending} onClick={() => attendanceMutation.mutate(status)}><i className={`fas ${icon} me-1`} />{label}</button>)}</div>}
      {registrationLabel && <p className="small text-muted mb-0 mt-2"><i className={`fas ${selection === "attending" ? "fa-check text-success" : "fa-xmark text-warning"} me-1`} />{registrationLabel}{registration.created_at && <> · {formatDate(registration.created_at, locale)}</>}</p>}</>}
    <div className="mt-3"><Link className="btn btn-sm btn-outline-primary" to={`/activity?event=${event.id}`}>{t("posts.eventDetail")}</Link></div>
  </aside>;
}

EventInfoBox.propTypes = {
  event: PropTypes.shape({
    id: PropTypes.number.isRequired, title: PropTypes.string.isRequired, description: PropTypes.string,
    starts_at: PropTypes.string, location: PropTypes.string, requires_planned: PropTypes.bool,
    planned_deadline: PropTypes.string, planned_status: PropTypes.string, planned_registered_at: PropTypes.string,
  }).isRequired,
};

export function PostsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "cs" ? "cs-CZ" : "en-US";
  const [page, setPage] = useState(1);
  const limit = 12;
  const { data, isLoading } = useQuery({
    queryKey: ["posts", "feed", "archive", page],
    queryFn: async () => (await api.get("/web/posts/feed", { params: { limit, offset: (page - 1) * limit } })).data,
    staleTime: 30_000,
  });
  const posts = data?.items || [];
  const currentPage = data?.page || page;
  const pages = data?.pages || 1;

  return <main className="posts-page">
    <HeroHeader title={t("posts.title")} subtitle={t("posts.subtitle")} icon="📰" />
    {isLoading ? <LoadingSpinner /> : posts.length === 0 ? <div className="text-muted py-5">{t("posts.empty")}</div> : <>
      <div className="row g-4">{posts.map((post) => <article className="col-12 col-md-6 col-xl-4" key={post.id}>
        <Link to={`/posts/${post.id}`} className="card h-100 text-decoration-none text-reset shadow-sm overflow-hidden post-list-card">
          {post.cover_media_id && <MediaPreview src={`/api/web/media/${post.cover_media_id}/file`} alt="" className="post-list-cover w-100" />}
          <div className="card-body"><h2 className="h5">{post.title}</h2>{post.excerpt && <p className="mb-3 text-muted">{post.excerpt}</p>}<div className="d-flex align-items-center gap-2 small text-muted"><UserAvatar user={{ real_name: post.author, avatar: post.author_avatar }} size={26} fallbackClass="bg-success" /><span>{post.author || t("common.group")} · {formatDate(post.published_at, locale)}</span></div></div>
        </Link>
      </article>)}</div>
      {pages > 1 && <div className="d-flex justify-content-center align-items-center gap-2 mt-4"><button className="btn btn-outline-secondary" disabled={currentPage === 1} onClick={() => setPage((current) => current - 1)}>{t("common.previous")}</button><span className="small text-muted">{t("common.pageOf", { page: currentPage, pages })}</span><button className="btn btn-outline-secondary" disabled={currentPage === pages} onClick={() => setPage((current) => current + 1)}>{t("common.next")}</button></div>}
    </>}
  </main>;
}

export function PostDetailPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "cs" ? "cs-CZ" : "en-US";
  const { id } = useParams();
  const { data: post, isLoading, isError } = useQuery({
    queryKey: ["posts", "feed", id],
    queryFn: async () => (await api.get(`/web/posts/feed/${id}`)).data,
    enabled: Boolean(id),
  });
  if (isLoading) return <div className="py-5"><LoadingSpinner /></div>;
  if (isError || !post) return <main className="post-reading py-4"><h1 className="h3">{t("posts.loadError")}</h1><Link to="/posts">{t("posts.back")}</Link></main>;
  return <main className="post-reading"><Link to="/posts" className="post-back-link small text-decoration-none"><i className="fas fa-arrow-left me-1" />{t("posts.allPosts")}</Link>
    <article className="mx-auto mt-3"><header className="post-reading-header"><h1>{post.title}</h1><div className="d-flex align-items-center gap-2 small text-muted mt-3"><UserAvatar user={{ real_name: post.author, avatar: post.author_avatar }} size={30} fallbackClass="bg-success" /><span>{post.author || t("common.group")} · {formatDate(post.published_at, locale)}</span></div></header>
    {post.cover_media_id && <MediaPreview src={`/api/web/media/${post.cover_media_id}/file`} alt="" className="post-reading-cover w-100 my-4" />}
    {post.event && <EventInfoBox event={post.event} />}
    <RichTextContent className="post-reading-body" value={post.body} />
    </article>
  </main>;
}

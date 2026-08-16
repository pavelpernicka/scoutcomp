import DOMPurify from "dompurify";
import { marked } from "marked";
import { formatDateToLocal, parseServerDate } from "../../utils/dateUtils";

marked.setOptions({ breaks: true });

export const renderMarkdown = (markdown) => ({
  __html: DOMPurify.sanitize(marked.parse(markdown || "")),
});

export const formatDate = (value, language = "en") => {
  const locale = language === "cs" ? "cs-CZ" : "en-US";
  return formatDateToLocal(value, locale);
};

export const formatRelativeTime = (value, language = "en", t) => {
  const date = parseServerDate(value);
  const now = new Date();
  const diffInMs = now - date;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) {
    return t("dashboard.timeAgo.justNow");
  }
  if (diffInMinutes < 60) {
    return t("dashboard.timeAgo.minutesAgo", { count: diffInMinutes });
  }
  if (diffInHours < 24) {
    return t("dashboard.timeAgo.hoursAgo", { count: diffInHours });
  }
  if (diffInDays < 7) {
    return t("dashboard.timeAgo.daysAgo", { count: diffInDays });
  }
  return formatDate(value, language);
};

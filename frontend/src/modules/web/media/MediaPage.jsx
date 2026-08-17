import { useTranslation } from "react-i18next";
import AdminPageHeader from "../admin/AdminPageHeader";
import MediaLibrary from "./MediaLibrary";
// The Core media route does not mount WebAdminLayout, which normally owns
// these shared MediaLibrary styles. Keep the manager self-contained.
import "../styles/admin.css";

export default function MediaPage() {
  const { t } = useTranslation();
  return (
    <section className="web-media-page">
      <AdminPageHeader title={t("web.nav.media")} description={t("web.mediaDescription")} />
      <MediaLibrary />
    </section>
  );
}

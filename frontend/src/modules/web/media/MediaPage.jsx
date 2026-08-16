import { useTranslation } from "react-i18next";
import AdminPageHeader from "../admin/AdminPageHeader";
import MediaLibrary from "./MediaLibrary";

export default function MediaPage() {
  const { t } = useTranslation();
  return (
    <section className="web-media-page">
      <AdminPageHeader title={t("web.nav.media")} description={t("web.mediaDescription")} />
      <MediaLibrary />
    </section>
  );
}

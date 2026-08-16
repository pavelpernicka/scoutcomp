import PropTypes from "prop-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import LoadingSpinner from "../../../components/LoadingSpinner";
import { cmsApi } from "../api/cms";

export default function RevisionsDialog({ pageId, onClose }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const revisionsQuery = useQuery({ queryKey: ["web", "revisions", pageId], queryFn: () => cmsApi.listRevisions(pageId) });
  const restore = useMutation({ mutationFn: (revisionId) => cmsApi.restoreRevision(pageId, revisionId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["web", "page", pageId] }); onClose(); } });
  const revisions = revisionsQuery.data || [];
  return <div className="web-editor-dialog-backdrop"><section className="web-editor-revisions-dialog" role="dialog" aria-modal="true" aria-labelledby="revisions-title"><header><h2 id="revisions-title">{t("web.revisions")}</h2><button type="button" onClick={onClose}><i className="fas fa-xmark" /><span className="visually-hidden">{t("web.close")}</span></button></header>{revisionsQuery.isLoading ? <LoadingSpinner /> : revisions.length === 0 ? <p className="web-editor-panel-empty">{t("web.noRevisions")}</p> : <ol>{revisions.map((revision) => <li key={revision.id}><span><strong>{revision.title || t("web.revision")}</strong><small>{revision.created_at ? new Date(revision.created_at).toLocaleString() : ""}</small></span><button type="button" className="btn btn-sm btn-outline-secondary" disabled={restore.isPending} onClick={() => { if (window.confirm(t("web.confirmRestoreRevision"))) restore.mutate(revision.id); }}>{t("web.restore")}</button></li>)}</ol>}</section></div>;
}
RevisionsDialog.propTypes = { pageId: PropTypes.number.isRequired, onClose: PropTypes.func.isRequired };
